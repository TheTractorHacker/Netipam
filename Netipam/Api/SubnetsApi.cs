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
                .Select(d => new DeviceLite(d.SubnetId, d.IpAddress, d.IsOnline,
                    d.ClientType != null && d.ClientType.IsDevice, d.IgnoreOffline, d.IsStatusTracked))
                .ToListAsync(ct);

            var assignments = await db.IpAssignments.AsNoTracking()
                .Select(a => new { a.SubnetId, a.IpAddress }).ToListAsync(ct);

            var used = infos.Keys.ToDictionary(k => k, _ => new HashSet<uint>());
            var reserved = infos.Keys.ToDictionary(k => k, _ => new HashSet<uint>());

            foreach (var d in devices)
            {
                if (d.SubnetId is null || !infos.TryGetValue(d.SubnetId.Value, out var info)) continue;
                if (!TryIp(d.IpAddress, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                used[d.SubnetId.Value].Add(u);
            }

            foreach (var a in assignments)
            {
                if (!infos.TryGetValue(a.SubnetId, out var info)) continue;
                if (!TryIp(a.IpAddress, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                reserved[a.SubnetId].Add(u);
            }

            var clients = devices.Where(d => d.SubnetId != null && !d.IsDevice)
                .GroupBy(d => d.SubnetId!.Value).ToDictionary(g => g.Key, g => g.Count());
            var devs = devices.Where(d => d.SubnetId != null && d.IsDevice)
                .GroupBy(d => d.SubnetId!.Value).ToDictionary(g => g.Key, g => g.Count());
            var offline = devices.Where(d => d.SubnetId != null && d.IsStatusTracked && !d.IsOnline && !d.IgnoreOffline)
                .GroupBy(d => d.SubnetId!.Value).ToDictionary(g => g.Key, g => g.Count());

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
            var (entity, error) = Normalize(input, new Subnet());
            if (error is not null) return Results.BadRequest(new { error });
            db.Subnets.Add(entity!);
            await db.SaveChangesAsync(ct);
            return Results.Ok(entity!.ToDto());
        }).RequireAuthorization("CanEdit");

        api.MapPut("/subnets/{id:int}", async (int id, SubnetInput input, AppDbContext db, CancellationToken ct) =>
        {
            var entity = await db.Subnets.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (entity is null) return Results.NotFound(new { error = "Subnet not found." });
            var (_, error) = Normalize(input, entity);
            if (error is not null) return Results.BadRequest(new { error });
            await db.SaveChangesAsync(ct);
            return Results.Ok(entity.ToDto());
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/subnets/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var entity = await db.Subnets.FindAsync(new object[] { id }, ct);
            if (entity is null) return Results.Ok(new { ok = true });
            db.Subnets.Remove(entity);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        // ---------- IPs of a subnet ----------
        api.MapGet("/subnets/{id:int}/ips", async (int id, AppDbContext db, AppSettingsService settings, CancellationToken ct) =>
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
            else if (info.UsableAddresses > MaxUsableToRender)
                error = $"Subnet is large ({info.UsableAddresses} usable IPs). Safety limit is {MaxUsableToRender}.";

            if (error is not null)
                return Results.Ok(new { subnet = header, error, rows = Array.Empty<object>(), options = opts, usableRange = (string?)null });

            var devicesWithIp = await db.Devices.AsNoTracking()
                .Include(d => d.ClientType)
                .Where(d => d.IpAddress != null && d.IpAddress != "")
                .ToListAsync(ct);

            var reservations = await db.IpAssignments.AsNoTracking().Where(a => a.SubnetId == id).ToListAsync(ct);
            var resByIp = new Dictionary<uint, IpAssignment>();
            foreach (var a in reservations)
            {
                if (!TryIp(a.IpAddress, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                resByIp[u] = a;
            }

            var byIp = new Dictionary<uint, List<Device>>();
            foreach (var d in devicesWithIp)
            {
                if (!TryIp(d.IpAddress, out var u) || u < info.NetworkUInt || u > info.BroadcastUInt) continue;
                if (!byIp.TryGetValue(u, out var list)) byIp[u] = list = new List<Device>();
                list.Add(d);
            }

            uint dMin = 0, dMax = 0;
            var hasDhcp = IpCidr.TryParseIPv4(subnet.DhcpRangeStart ?? "", out var ds, out _)
                          & IpCidr.TryParseIPv4(subnet.DhcpRangeEnd ?? "", out var de, out _);
            if (hasDhcp) { dMin = Math.Min(ds, de); dMax = Math.Max(ds, de); }

            var rows = GetUsableIps(info).Select(u =>
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

            return Results.Ok(new { subnet = header, error = (string?)null, rows, options = opts, usableRange = UsableRange(info) });
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

    private static (Subnet? entity, string? error) Normalize(SubnetInput input, Subnet entity)
    {
        var name = (input.Name ?? "").Trim();
        if (name.Length == 0) return (null, "Name is required.");

        var cidr = (input.Cidr ?? "").Trim();
        if (cidr.Length == 0) return (null, "CIDR is required.");
        if (!IpCidr.TryParseIPv4Cidr(cidr, out _, out var cidrError))
            return (null, string.IsNullOrWhiteSpace(cidrError) ? "Invalid CIDR." : cidrError);

        if (input.VlanId is < 1 or > 4094) return (null, "VLAN ID must be between 1 and 4094.");

        var dhcpStart = Trim(input.DhcpRangeStart);
        var dhcpEnd = Trim(input.DhcpRangeEnd);
        if (dhcpStart is not null && !IpCidr.TryParseIPv4(dhcpStart, out _, out _)) return (null, "DHCP start is not a valid IPv4 address.");
        if (dhcpEnd is not null && !IpCidr.TryParseIPv4(dhcpEnd, out _, out _)) return (null, "DHCP end is not a valid IPv4 address.");

        entity.Name = name;
        entity.Cidr = cidr;
        entity.DhcpRangeStart = dhcpStart;
        entity.DhcpRangeEnd = dhcpEnd;
        entity.Dns1 = Trim(input.Dns1);
        entity.Dns2 = Trim(input.Dns2);
        entity.VlanId = input.VlanId;
        entity.Description = Trim(input.Description);
        return (entity, null);
    }

    private static string? Trim(string? s) => s?.Trim();

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
