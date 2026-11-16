using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Helpers;
using Netipam.Services;

namespace Netipam.Api;

public sealed class SubnetsApi : IApiModule
{
    private const int MaxUsableToRender = 8192;

    private static readonly Regex FirstIPv4Regex =
        new(@"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b", RegexOptions.Compiled);

    public sealed record SubnetInput(string? Name, string? Cidr, string? Description, string? DhcpRangeStart,
        string? DhcpRangeEnd, string? Dns1, string? Dns2, int? VlanId);

    public sealed record ReservationInput(string? Ip, string? Status, string? Notes);

    public sealed record SettingsInput(int FreeIpCount);

    public void Map(RouteGroupBuilder api)
    {
        // ---------- list ----------
        api.MapGet("/subnets", async (AppDbContext db, AppSettingsService settings, CancellationToken ct) =>
        {
            var subnets = await db.Subnets.AsNoTracking()
                .OrderBy(s => s.VlanId ?? int.MaxValue).ThenBy(s => s.Cidr).ThenBy(s => s.Name)
                .ToListAsync(ct);

            var freeIpCount = Math.Max(1, (await settings.LoadAsync(ct)).SubnetFreeIpDisplayCount);

            var infos = new Dictionary<int, IpCidr.CidrInfo>();
            foreach (var s in subnets)
            {
                if (string.IsNullOrWhiteSpace(s.Cidr)) continue;
                if (IpCidr.TryParseIPv4Cidr(s.Cidr.Trim(), out var info, out _)) infos[s.Id] = info;
            }

            var devices = await db.Devices.AsNoTracking()
                .Where(d => d.IpAddress != null && d.IpAddress != "")
                .Select(d => new DeviceLite(d.SubnetId, d.IpAddress, d.IsOnline,
                    d.ClientType != null && d.ClientType.IsDevice, d.IgnoreOffline, d.IsStatusTracked))
                .ToListAsync(ct);

            var assignments = await db.IpAssignments.AsNoTracking()
                .Select(a => new { a.SubnetId, a.IpAddress }).ToListAsync(ct);

            var used = infos.Keys.ToDictionary(k => k, _ => new HashSet<uint>());
            var reserved = infos.Keys.ToDictionary(k => k, _ => new HashSet<uint>());

            // Membership is derived from IP range (same rule as /subnets/{id}/ips), not Device.SubnetId.
            var clients = new Dictionary<int, int>();
            var devs = new Dictionary<int, int>();
            var offline = new Dictionary<int, int>();
            foreach (var d in devices)
            {
                if (!TryIp(d.IpAddress, out var u)) continue;
                foreach (var (sid, info) in infos)
                {
                    if (u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                    used[sid].Add(u);
                    var bucket = d.IsDevice ? devs : clients;
                    bucket[sid] = bucket.GetValueOrDefault(sid) + 1;
                    if (d.IsStatusTracked && !d.IsOnline && !d.IgnoreOffline)
                        offline[sid] = offline.GetValueOrDefault(sid) + 1;
                }
            }

            foreach (var a in assignments)
            {
                if (!infos.TryGetValue(a.SubnetId, out var info)) continue;
                if (!TryIp(a.IpAddress, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                reserved[a.SubnetId].Add(u);
            }

            var items = subnets.Select(s =>
            {
                var hasInfo = infos.TryGetValue(s.Id, out var info);
                var nextFree = hasInfo
                    ? FindNextFreeIps(info, s.DhcpRangeStart, s.DhcpRangeEnd, used[s.Id], reserved[s.Id], freeIpCount)
                    : new List<string>();
                return new
                {
                    s.Id,
                    s.Name,
                    s.Cidr,
                    s.Description,
                    s.VlanId,
                    s.DhcpRangeStart,
                    s.DhcpRangeEnd,
                    s.Dns1,
                    s.Dns2,
                    validCidr = hasInfo,
                    usableRange = hasInfo ? UsableRange(info) : null,
                    usable = hasInfo ? info.UsableAddresses : (long?)null,
                    total = hasInfo ? info.TotalAddresses : (long?)null,
                    usedIps = used.TryGetValue(s.Id, out var us) ? us.Count : 0,
                    clients = clients.GetValueOrDefault(s.Id),
                    devices = devs.GetValueOrDefault(s.Id),
                    offline = offline.GetValueOrDefault(s.Id),
                    nextFreeIps = nextFree,
                };
            }).ToList();

            return Results.Ok(new { freeIpCount, items });
        });

        // ---------- CIDR helper ----------
        api.MapGet("/subnets/cidr", (string? value) =>
        {
            if (!IpCidr.TryParseIPv4Cidr(value ?? "", out var info, out var error))
                return Results.Ok(new { valid = false, error });
            return Results.Ok(new
            {
                valid = true,
                error = (string?)null,
                network = info.Network,
                broadcast = info.Broadcast,
                prefix = info.PrefixLength,
                usableRange = UsableRange(info),
                usable = info.UsableAddresses,
                total = info.TotalAddresses,
            });
        });

        // ---------- settings (free IP count) ----------
        api.MapPut("/subnets/settings", async (SettingsInput input, AppSettingsService settings, CancellationToken ct) =>
        {
            var n = Math.Clamp(input.FreeIpCount, 1, 50);
            await settings.UpdateAsync(s => s.SubnetFreeIpDisplayCount = n, ct);
            return Results.Ok(new { freeIpCount = n });
        }).RequireAuthorization("AdminOnly");

        // ---------- CRUD ----------
        api.MapGet("/subnets/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var s = await db.Subnets.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            return s is null ? Results.NotFound(new { error = "Subnet not found." }) : Results.Ok(s.ToDto());
        });

        api.MapPost("/subnets", async (SubnetInput input, AppDbContext db, CancellationToken ct) =>
        {
            var entity = new Subnet();
            var error = await NormalizeAsync(input, entity, null, db, ct);
            if (error is not null) return Results.BadRequest(new { error });
            db.Subnets.Add(entity);
            if (await TrySaveAsync(db, ct) is { } conflict) return conflict;
            await ResyncDeviceSubnetsAsync(db, ct);
            return Results.Ok(entity.ToDto());
        }).RequireAuthorization("CanEdit");

        api.MapPut("/subnets/{id:int}", async (int id, SubnetInput input, AppDbContext db, CancellationToken ct) =>
        {
            var entity = await db.Subnets.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (entity is null) return Results.NotFound(new { error = "Subnet not found." });
            var error = await NormalizeAsync(input, entity, id, db, ct);
            if (error is not null) return Results.BadRequest(new { error });
            if (await TrySaveAsync(db, ct) is { } conflict) return conflict;
            await ResyncDeviceSubnetsAsync(db, ct);
            return Results.Ok(entity.ToDto());
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/subnets/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var entity = await db.Subnets.FindAsync(new object[] { id }, ct);
            if (entity is null) return Results.Ok(new { ok = true });
            db.Subnets.Remove(entity);
            await db.SaveChangesAsync(ct);
            await ResyncDeviceSubnetsAsync(db, ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        // ---------- IPs of a subnet ----------
        api.MapGet("/subnets/{id:int}/ips", async (int id, string? block, AppDbContext db, AppSettingsService settings, CancellationToken ct) =>
        {
            var subnet = await db.Subnets.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
            if (subnet is null) return Results.NotFound(new { error = "Subnet not found." });

            var app = await settings.LoadAsync(ct);
            var header = new
            {
                subnet.Id, subnet.Name, subnet.Cidr, subnet.Description, subnet.VlanId,
                subnet.DhcpRangeStart, subnet.DhcpRangeEnd, subnet.Dns1, subnet.Dns2,
            };
            var opts = new { showTooltips = app.ShowLastSeenTooltips, autoRefreshSeconds = app.UiAutoRefreshSeconds };

            string? error = null;
            IpCidr.CidrInfo info = default;
            if (string.IsNullOrWhiteSpace(subnet.Cidr))
                error = "Subnet CIDR is blank.";
            else if (!IpCidr.TryParseIPv4Cidr(subnet.Cidr, out info, out var parseError))
                error = $"Invalid CIDR: {subnet.Cidr}" + (!string.IsNullOrWhiteSpace(parseError) ? $" ({parseError})" : "");

            if (error is not null)
                return Results.Ok(new { subnet = header, error, rows = Array.Empty<object>(), options = opts, usableRange = (string?)null });

            var large = info.UsableAddresses > MaxUsableToRender;
            var scope = info; // the address range the rows cover
            var blockText = (string?)null;
            if (!string.IsNullOrWhiteSpace(block))
            {
                if (!IpCidr.TryParseIPv4Cidr(block.Trim(), out var binfo, out var berr))
                    return Results.BadRequest(new { error = "Invalid block: " + (berr ?? block) });
                if (binfo.PrefixLength < 22 || binfo.PrefixLength > 30)
                    return Results.BadRequest(new { error = "Block must be between /22 and /30." });
                if (binfo.NetworkUInt < info.NetworkUInt || binfo.BroadcastUInt > info.BroadcastUInt)
                    return Results.BadRequest(new { error = "Block is not inside this subnet." });
                scope = binfo;
                blockText = $"{binfo.Network}/{binfo.PrefixLength}";
            }

            object[]? blocks = null;
            if (large)
            {
                var span = (long)info.BroadcastUInt - info.NetworkUInt + 1;
                var firstBlock = info.NetworkUInt >> 8;
                var count = (int)Math.Min(span >> 8, int.MaxValue);
                if (span < 256) count = 1;
                if (count > 4096)
                {
                    if (blockText is null)
                        return Results.Ok(new
                        {
                            subnet = header, error = "Subnet is too large to browse (max /12).", rows = Array.Empty<object>(),
                            options = opts, usableRange = (string?)null, large = true, block = (string?)null,
                            blocks = Array.Empty<object>(),
                        });
                }
                else
                {
                    var devs = await db.Devices.AsNoTracking()
                        .Where(d => d.IpAddress != null && d.IpAddress != "")
                        .Select(d => new { d.IpAddress, d.IsOnline, d.IsStatusTracked })
                        .ToListAsync(ct);
                    var res = await db.IpAssignments.AsNoTracking().Where(a => a.SubnetId == id)
                        .Select(a => a.IpAddress).ToListAsync(ct);

                    var usedBy = new int[count];
                    var onlineBy = new int[count];
                    var offlineBy = new int[count];
                    var resBy = new int[count];
                    // per-IP state: 1 = used, 2 = online, 4 = tracked
                    var state = new Dictionary<uint, byte>();
                    foreach (var d in devs)
                    {
                        if (!TryIp(d.IpAddress, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                        state.TryGetValue(u, out var st);
                        st |= 1;
                        if (d.IsStatusTracked) st |= 4;
                        if (d.IsStatusTracked && d.IsOnline) st |= 2;
                        state[u] = st;
                    }
                    var usedIps = state.Keys.ToHashSet();
                    foreach (var (u, st) in state)
                    {
                        var bi = (int)((u >> 8) - firstBlock);
                        if (bi < 0 || bi >= count) continue;
                        usedBy[bi]++;
                        if ((st & 2) != 0) onlineBy[bi]++;
                        else if ((st & 4) != 0) offlineBy[bi]++;
                    }
                    var resSeen = new HashSet<uint>();
                    foreach (var r in res)
                    {
                        if (!TryIp(r, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                        if (usedIps.Contains(u) || !resSeen.Add(u)) continue;
                        var bi = (int)((u >> 8) - firstBlock);
                        if (bi >= 0 && bi < count) resBy[bi]++;
                    }

                    blocks = new object[count];
                    for (var i = 0; i < count; i++)
                    {
                        var bs = Math.Max(info.NetworkUInt, (uint)((firstBlock + (uint)i) << 8));
                        var be = Math.Min(info.BroadcastUInt, (uint)(((firstBlock + (uint)i) << 8) | 255));
                        long usable = (long)be - bs + 1;
                        if (usable > 2) usable -= 2; // network + broadcast of the block
                        blocks[i] = new
                        {
                            cidr = $"{IpCidr.UIntToIPv4(bs)}/24",
                            usable,
                            used = usedBy[i],
                            online = onlineBy[i],
                            offline = offlineBy[i],
                            reserved = resBy[i],
                            free = (int)Math.Max(0, usable - usedBy[i] - resBy[i]),
                        };
                    }
                }
            }

            if (large && blockText is null)
                return Results.Ok(new
                {
                    subnet = header, error = (string?)null, rows = Array.Empty<object>(), options = opts,
                    usableRange = (string?)null, large = true, block = (string?)null, blocks,
                });

            var devicesWithIp = await db.Devices.AsNoTracking()
                .Include(d => d.ClientType)
                .Where(d => d.IpAddress != null && d.IpAddress != "")
                .ToListAsync(ct);

            var reservations = await db.IpAssignments.AsNoTracking().Where(a => a.SubnetId == id).ToListAsync(ct);
            var resByIp = new Dictionary<uint, IpAssignment>();
            foreach (var a in reservations)
            {
                if (!TryIp(a.IpAddress, out var u) || u < scope.NetworkUInt || u > scope.BroadcastUInt) continue;
                resByIp[u] = a;
            }

            var byIp = new Dictionary<uint, List<Device>>();
            foreach (var d in devicesWithIp)
            {
                if (!TryIp(d.IpAddress, out var u) || u < scope.NetworkUInt || u > scope.BroadcastUInt) continue;
                if (!byIp.TryGetValue(u, out var list)) byIp[u] = list = new List<Device>();
                list.Add(d);
            }

            uint dMin = 0, dMax = 0;
            var hasDhcp = IpCidr.TryParseIPv4(subnet.DhcpRangeStart ?? "", out var ds, out _)
                          & IpCidr.TryParseIPv4(subnet.DhcpRangeEnd ?? "", out var de, out _);
            if (hasDhcp) { dMin = Math.Min(ds, de); dMax = Math.Max(ds, de); }

            var rows = GetUsableIps(scope).Select(u =>
            {
                byIp.TryGetValue(u, out var devs);
                devs ??= new List<Device>();
                resByIp.TryGetValue(u, out var resv);
                var inDhcp = hasDhcp && u >= dMin && u <= dMax;
                var isUsed = devs.Count > 0;
                var online = devs.Any(d => d.IsStatusTracked && d.IsOnline);

                string status;
                if (isUsed) status = inDhcp ? "assignedDhcp" : "assignedStatic";
                else if (resv is not null)
                    status = resv.Status switch
                    {
                        IpReservationStatus.Reserved => "reserved",
                        IpReservationStatus.Dhcp => "dhcp",
                        IpReservationStatus.Deprecated => "deprecated",
                        _ => "available",
                    };
                else status = inDhcp ? "dhcp" : "available";

                return new
                {
                    ip = IpCidr.UIntToIPv4(u),
                    status,
                    isUsed,
                    inDhcp,
                    online = isUsed && online,
                    reservation = resv is null ? null : new
                    {
                        resv.Id,
                        status = resv.Status == IpReservationStatus.Dhcp ? "DHCP" : resv.Status.ToString(),
                        resv.Notes,
                        updatedUtc = Utc(resv.UpdatedUtc),
                    },
                    devices = devs.Select(d => new
                    {
                        d.Id,
                        d.Name,
                        d.Hostname,
                        d.MacAddress,
                        ipDisplay = DisplayFormat.FormatIpWithPort(d),
                        accessHref = BuildHref(d.AccessLink),
                        type = d.ClientType?.Name,
                        isDevice = d.ClientType?.IsDevice ?? false,
                        d.ConnectionType,
                        d.ConnectionDetail,
                        d.UpstreamDeviceName,
                        d.UpstreamConnection,
                        hosted = d.HostDeviceId != null,
                        d.IsOnline,
                        d.IsStatusTracked,
                        lastSeenAt = Utc(d.LastSeenAt),
                        lastOnlineAt = Utc(d.LastOnlineAt),
                    }).ToList(),
                };
            }).ToList();

            return Results.Ok(new { subnet = header, error = (string?)null, rows, options = opts, usableRange = UsableRange(scope), large, block = blockText, blocks });
        });

        // ---------- IP reservation ----------
        api.MapPut("/subnets/{id:int}/reservations", async (int id, ReservationInput input, AppDbContext db, CancellationToken ct) =>
        {
            var ipText = (input.Ip ?? "").Trim();
            if (ipText.Length == 0) return Results.BadRequest(new { error = "IP address is required." });
            if (!IpCidr.TryParseIPv4(ipText, out var ipU, out _))
                return Results.BadRequest(new { error = "IP address is not a valid IPv4 address." });
            var ip = IpCidr.UIntToIPv4(ipU);
            var sub = await db.Subnets.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
            if (sub is null)
                return Results.NotFound(new { error = "Subnet not found." });
            if (!IpCidr.TryParseIPv4Cidr(sub.Cidr ?? "", out var subInfo, out _)
                || ipU < subInfo.NetworkUInt || ipU > subInfo.BroadcastUInt)
                return Results.BadRequest(new { error = "IP address is outside this subnet." });
            if (subInfo.PrefixLength < 31 && (ipU == subInfo.NetworkUInt || ipU == subInfo.BroadcastUInt))
                return Results.BadRequest(new { error = "The network and broadcast addresses cannot be reserved." });
            if ((input.Notes ?? "").Trim().Length > 500)
                return Results.BadRequest(new { error = "Notes must be 500 characters or fewer." });

            var existing = await db.IpAssignments.FirstOrDefaultAsync(a => a.SubnetId == id && a.IpAddress == ip, ct);
            var statusText = (input.Status ?? "Available").Trim();

            if (statusText.Equals("Available", StringComparison.OrdinalIgnoreCase))
            {
                if (existing is not null)
                {
                    db.IpAssignments.Remove(existing);
                    await db.SaveChangesAsync(ct);
                }
                return Results.Ok(new { ok = true });
            }

            IpReservationStatus status;
            if (statusText.Equals("Reserved", StringComparison.OrdinalIgnoreCase)) status = IpReservationStatus.Reserved;
            else if (statusText.Equals("DHCP", StringComparison.OrdinalIgnoreCase)) status = IpReservationStatus.Dhcp;
            else if (statusText.Equals("Deprecated", StringComparison.OrdinalIgnoreCase)) status = IpReservationStatus.Deprecated;
            else return Results.BadRequest(new { error = "Status must be Available, Reserved, DHCP or Deprecated." });

            var notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
            var deviceIps = await db.Devices.AsNoTracking()
                .Where(d => d.IpAddress != null && d.IpAddress != "").Select(d => d.IpAddress!).ToListAsync(ct);
            if (deviceIps.Any(x => IpCidr.TryParseIPv4(x, out var du, out _) && du == ipU))
                return Results.BadRequest(new { error = "A device already uses this IP address." });
            if (existing is null)
            {
                db.IpAssignments.Add(new IpAssignment
                {
                    SubnetId = id, IpAddress = ip, Status = status, Notes = notes, UpdatedUtc = DateTime.UtcNow,
                });
            }
            else
            {
                existing.Status = status;
                existing.Notes = notes;
                existing.UpdatedUtc = DateTime.UtcNow;
            }
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                // Concurrent create hit the unique (SubnetId, IpAddress) index: treat as update.
                db.ChangeTracker.Clear();
                var row = await db.IpAssignments.FirstOrDefaultAsync(a => a.SubnetId == id && a.IpAddress == ip, ct);
                if (row is null) return Results.Conflict(new { error = "Could not save reservation." });
                row.Status = status; row.Notes = notes; row.UpdatedUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");
    }

    // ---------- helpers ----------

    private static async Task<string?> NormalizeAsync(SubnetInput input, Subnet entity, int? selfId, AppDbContext db, CancellationToken ct)
    {
        var name = (input.Name ?? "").Trim();
        if (name.Length == 0) return "Name is required.";
        if (name.Length > 200) return "Name must be 200 characters or fewer.";

        var cidrText = (input.Cidr ?? "").Trim();
        if (cidrText.Length == 0) return "CIDR is required.";
        if (!IpCidr.TryParseIPv4Cidr(cidrText, out var info, out var cidrError))
            return string.IsNullOrWhiteSpace(cidrError) ? "Invalid CIDR." : cidrError;

        if (input.VlanId is < 1 or > 4094) return "VLAN ID must be between 1 and 4094.";

        var description = Blank(input.Description);
        if (description is { Length: > 2000 }) return "Description must be 2000 characters or fewer.";

        var dhcpStart = Blank(input.DhcpRangeStart);
        var dhcpEnd = Blank(input.DhcpRangeEnd);
        if ((dhcpStart is null) != (dhcpEnd is null)) return "Set both DHCP start and DHCP end, or neither.";
        if (dhcpStart is not null && dhcpEnd is not null)
        {
            if (!IpCidr.TryParseIPv4(dhcpStart, out var ds, out _)) return "DHCP start is not a valid IPv4 address.";
            if (!IpCidr.TryParseIPv4(dhcpEnd, out var de, out _)) return "DHCP end is not a valid IPv4 address.";
            if (ds < info.NetworkUInt || ds > info.BroadcastUInt || de < info.NetworkUInt || de > info.BroadcastUInt)
                return "DHCP range must be inside the subnet.";
            if (ds > de) return "DHCP start must not be after DHCP end.";
        }

        var dns1 = Blank(input.Dns1);
        var dns2 = Blank(input.Dns2);
        if (dns1 is not null && !IpCidr.TryParseIPv4(dns1, out _, out _)) return "DNS 1 is not a valid IPv4 address.";
        if (dns2 is not null && !IpCidr.TryParseIPv4(dns2, out _, out _)) return "DNS 2 is not a valid IPv4 address.";

        // Overlap / duplicate check against all other subnets.
        var others = await db.Subnets.AsNoTracking()
            .Where(s => selfId == null || s.Id != selfId)
            .Select(s => new { s.Name, s.Cidr }).ToListAsync(ct);
        foreach (var o in others)
        {
            if (string.IsNullOrWhiteSpace(o.Cidr) || !IpCidr.TryParseIPv4Cidr(o.Cidr, out var oi, out _)) continue;
            if (info.NetworkUInt <= oi.BroadcastUInt && oi.NetworkUInt <= info.BroadcastUInt)
                return $"CIDR {info.Cidr} overlaps subnet \"{o.Name}\" ({oi.Cidr}).";
        }

        entity.Name = name;
        entity.Cidr = info.Cidr; // canonical network/prefix
        entity.DhcpRangeStart = dhcpStart;
        entity.DhcpRangeEnd = dhcpEnd;
        entity.Dns1 = dns1;
        entity.Dns2 = dns2;
        entity.VlanId = input.VlanId;
        entity.Description = description;
        return null;
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static async Task<IResult?> TrySaveAsync(AppDbContext db, CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); return null; }
        catch (DbUpdateException)
        {
            return Results.Conflict(new { error = "A subnet with that CIDR already exists." });
        }
    }

    /// <summary>Re-derives Device.SubnetId from IP range membership after subnets change.</summary>
    private static async Task ResyncDeviceSubnetsAsync(AppDbContext db, CancellationToken ct)
    {
        db.ChangeTracker.Clear();
        var ranges = new List<(int Id, IpCidr.CidrInfo Info)>();
        foreach (var s in await db.Subnets.AsNoTracking().OrderBy(s => s.Id).Select(s => new { s.Id, s.Cidr }).ToListAsync(ct))
            if (!string.IsNullOrWhiteSpace(s.Cidr) && IpCidr.TryParseIPv4Cidr(s.Cidr, out var info, out _))
                ranges.Add((s.Id, info));

        var devices = await db.Devices.Where(d => d.IpAddress != null && d.IpAddress != "" || d.SubnetId != null).ToListAsync(ct);
        var changed = false;
        foreach (var d in devices)
        {
            int? sid = null;
            if (TryIp(d.IpAddress, out var u))
                foreach (var (id, info) in ranges)
                    if (u >= info.NetworkUInt && u <= info.BroadcastUInt) { sid = id; break; }
            if (d.SubnetId != sid) { d.SubnetId = sid; changed = true; }
        }
        if (changed) await db.SaveChangesAsync(ct);
    }

    private static string? Utc(DateTime? dt)
        => dt is null ? null : DateTime.SpecifyKind(dt.Value, DateTimeKind.Utc).ToString("o");

    private static string? BuildHref(string? raw)
    {
        // Never fall back to the raw value: it may be a javascript:/data: URL.
        return DisplayFormat.TryBuildAccessLink(raw, out var href) ? href : null;
    }

    private static bool TryIp(string? text, out uint value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(text)) return false;
        var m = FirstIPv4Regex.Match(text);
        return m.Success && IpCidr.TryParseIPv4(m.Value, out value, out _);
    }

    private static string UsableRange(IpCidr.CidrInfo info)
    {
        if (info.PrefixLength == 32) return $"{info.Network} (single host)";
        if (info.PrefixLength == 31) return $"{info.Network} – {info.Broadcast} (/31)";
        return info.FirstUsable is not null && info.LastUsable is not null
            ? $"{info.FirstUsable} – {info.LastUsable}" : "—";
    }

    private static List<uint> GetUsableIps(IpCidr.CidrInfo info)
    {
        if (info.PrefixLength == 32) return new List<uint> { info.NetworkUInt };
        if (info.PrefixLength == 31) return new List<uint> { info.NetworkUInt, info.BroadcastUInt };
        if (string.IsNullOrWhiteSpace(info.FirstUsable) || string.IsNullOrWhiteSpace(info.LastUsable)) return new();
        if (!IpCidr.TryParseIPv4(info.FirstUsable, out var start, out _)) return new();
        if (!IpCidr.TryParseIPv4(info.LastUsable, out var end, out _)) return new();
        var list = new List<uint>();
        for (var ip = start; ip <= end; ip++)
        {
            list.Add(ip);
            if (ip == uint.MaxValue) break;
        }
        return list;
    }

    private static List<string> FindNextFreeIps(IpCidr.CidrInfo info, string? dhcpStart, string? dhcpEnd,
        HashSet<uint> usedSet, HashSet<uint> reservedSet, int count)
    {
        var results = new List<string>();
        if (string.IsNullOrWhiteSpace(info.FirstUsable) || string.IsNullOrWhiteSpace(info.LastUsable)) return results;
        if (!IpCidr.TryParseIPv4(info.FirstUsable, out var start, out _)) return results;
        if (!IpCidr.TryParseIPv4(info.LastUsable, out var end, out _)) return results;

        var hasStart = IpCidr.TryParseIPv4(dhcpStart ?? "", out var ds, out _);
        var hasEnd = IpCidr.TryParseIPv4(dhcpEnd ?? "", out var de, out _);
        if (hasStart && hasEnd && de < ds) (ds, de) = (de, ds);

        for (var ip = start; ip <= end && results.Count < count; ip++)
        {
            if (usedSet.Contains(ip) || reservedSet.Contains(ip)) { if (ip == uint.MaxValue) break; continue; }
            if (hasStart && hasEnd && ip >= ds && ip <= de) { if (ip == uint.MaxValue) break; continue; }
            results.Add(IpCidr.UIntToIPv4(ip));
            if (ip == uint.MaxValue) break;
        }
        return results;
    }

    private sealed record DeviceLite(int? SubnetId, string? IpAddress, bool IsOnline, bool IsDevice, bool IgnoreOffline, bool IsStatusTracked);
}

internal static class SubnetDtoExt
{
    public static object ToDto(this Subnet s) => new
    {
        s.Id, s.Name, s.Cidr, s.Description, s.VlanId, s.DhcpRangeStart, s.DhcpRangeEnd, s.Dns1, s.Dns2,
    };
}
