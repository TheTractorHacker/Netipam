using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Services;
using Netipam.Unifi;

namespace Netipam.Api;

public sealed partial class DashboardApi : IApiModule
{
    public sealed record AddDiscoveryRequest(string? Name, string? Hostname, string? IpAddress, string? MacAddress,
        string? UpstreamDeviceName, string? UpstreamConnection, int? ClientTypeId);

    [GeneratedRegex(@"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")]
    private static partial Regex FirstIPv4();

    private static string? ExtractFirstIPv4(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var m = FirstIPv4().Match(text);
        return m.Success ? m.Value : null;
    }

    private static string? Iso(DateTime? utc)
        => utc is null ? null : DateTime.SpecifyKind(utc.Value, DateTimeKind.Utc).ToString("o");

    private static bool IsWifi(string? t) => !string.IsNullOrWhiteSpace(t) && t.Trim().Equals("WiFi", StringComparison.OrdinalIgnoreCase);
    private static bool IsWired(string? t) => !string.IsNullOrWhiteSpace(t) && t.Trim().Equals("Wired", StringComparison.OrdinalIgnoreCase);

    private static string? BuildUpstream(string? name, string? conn)
    {
        var n = string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        var c = string.IsNullOrWhiteSpace(conn) ? null : conn.Trim();
        if (n != null && c != null) return $"{n} | {c}";
        return n ?? c;
    }

    private static string? FormatRack(string? name, int? pos, int? size)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        if (pos is null) return name;
        return size is null ? $"{name} U{pos}" : $"{name} U{pos} ({size}U)";
    }

    private static bool TryAccessLink(string? raw, out string href)
    {
        href = "";
        if (string.IsNullOrWhiteSpace(raw)) return false;
        raw = raw.Trim();
        if (Uri.TryCreate(raw, UriKind.Absolute, out var uri)) { href = uri.ToString(); return true; }
        if (Uri.TryCreate("http://" + raw, UriKind.Absolute, out var u2)) { href = u2.ToString(); return true; }
        return false;
    }

    private static string WanLabel(WanInterfaceStatus wan, List<WanInterfaceStatus> group)
    {
        var name = wan.InterfaceName ?? "";
        if (name.Equals("wan1", StringComparison.OrdinalIgnoreCase)) return "Primary WAN";
        if (name.Equals("wan2", StringComparison.OrdinalIgnoreCase)) return "Secondary WAN";
        if (name.Equals("wan", StringComparison.OrdinalIgnoreCase)) return "WAN";
        if (name.Equals("uplink", StringComparison.OrdinalIgnoreCase))
        {
            string? active = null;
            if (!string.IsNullOrWhiteSpace(wan.IpAddress))
            {
                var ip = wan.IpAddress.Trim();
                var w1 = group.FirstOrDefault(w => w.InterfaceName.Equals("wan1", StringComparison.OrdinalIgnoreCase));
                var w2 = group.FirstOrDefault(w => w.InterfaceName.Equals("wan2", StringComparison.OrdinalIgnoreCase));
                if (w1 != null && string.Equals(w1.IpAddress?.Trim(), ip, StringComparison.OrdinalIgnoreCase)) active = "Primary";
                else if (w2 != null && string.Equals(w2.IpAddress?.Trim(), ip, StringComparison.OrdinalIgnoreCase)) active = "Secondary";
            }
            return string.IsNullOrWhiteSpace(active) ? "Active WAN" : $"Active WAN ({active})";
        }
        return name.ToUpperInvariant();
    }

    public void Map(RouteGroupBuilder api)
    {
        // Legacy compact summary (kept for compatibility).
        api.MapGet("/summary", async (AppDbContext db, CancellationToken ct) =>
        {
            var rows = await db.Devices.AsNoTracking()
                .Select(d => new
                {
                    d.SubnetId, d.IsOnline, d.IsStatusTracked, d.IgnoreOffline,
                    IsDevice = d.ClientType != null && d.ClientType.IsDevice,
                    Wired = d.ConnectionType != null && d.ConnectionType.ToLower() == "wired"
                })
                .ToListAsync(ct);

            var subnets = await db.Subnets.AsNoTracking().OrderBy(s => s.Name).ToListAsync(ct);
            var subnetRows = subnets.Select(s =>
            {
                long usable = 0;
                if (IpCidr.TryParseIPv4Cidr(s.Cidr, out var info, out _)) usable = info.UsableAddresses;
                var inSubnet = rows.Where(r => r.SubnetId == s.Id).ToList();
                return new
                {
                    s.Id, s.Name, s.Cidr, s.VlanId, usable,
                    used = inSubnet.Count,
                    available = Math.Max(0, usable - inSubnet.Count),
                    clients = inSubnet.Count(r => !r.IsDevice),
                    devices = inSubnet.Count(r => r.IsDevice),
                    offline = inSubnet.Count(r => r.IsStatusTracked && !r.IsOnline && !r.IgnoreOffline)
                };
            }).ToList();

            return Results.Ok(new
            {
                clients = rows.Count(r => !r.IsDevice),
                devices = rows.Count(r => r.IsDevice),
                wired = rows.Count(r => r.Wired),
                wireless = rows.Count(r => !r.Wired && r.IsStatusTracked),
                offline = rows.Count(r => r.IsStatusTracked && !r.IsOnline && !r.IgnoreOffline),
                offlineAlerts = await db.ClientOfflineAlerts.CountAsync(a => !a.IsAcknowledged, ct),
                newDevices = await db.ClientDiscoveryAlerts.CountAsync(a => !a.IsAcknowledged, ct),
                firmwareUpdates = await db.DeviceFirmwareUpdateAlerts.CountAsync(a => !a.IsAcknowledged, ct),
                subnets = subnetRows
            });
        });

        // Everything the Home page shows, in one read model.
        api.MapGet("/dashboard", async (AppDbContext db, AppSettingsService settingsSvc, UnifiUpdaterControl updater, CancellationToken ct) =>
        {
            var settings = await settingsSvc.LoadAsync(ct);

            // ---- alert counts / lists (ignored devices & MACs excluded, as in classic) ----
            var offlineBase = db.ClientOfflineAlerts.AsNoTracking()
                .Where(a => !a.IsAcknowledged && a.Device != null && !a.Device.IgnoreOffline && a.Device.IsStatusTracked);
            var offlineCount = await offlineBase.CountAsync(ct);

            var ignoredMacs = await db.IgnoredDiscoveryMacs.AsNoTracking().Select(i => i.Mac).ToListAsync(ct);
            var discoveryBase = db.ClientDiscoveryAlerts.AsNoTracking()
                .Where(a => !a.IsAcknowledged && !ignoredMacs.Contains(a.Mac));
            var discoveryCount = await discoveryBase.CountAsync(ct);

            var firmwareBase = db.DeviceFirmwareUpdateAlerts.AsNoTracking()
                .Where(a => !a.IsAcknowledged && a.ResolvedAtUtc == null);
            var firmwareCount = await firmwareBase.CountAsync(ct);

            var offlineRaw = await offlineBase
                .OrderByDescending(a => a.WentOfflineAtUtc).Take(10)
                .Select(a => new
                {
                    a.Id,
                    DeviceId = (int?)a.DeviceId,
                    Name = a.Device!.Name ?? a.NameAtTime,
                    Hostname = a.Device!.Hostname,
                    Ip = a.IpAtTime ?? a.Device!.IpAddress,
                    ConnectionType = a.Device!.ConnectionType,
                    ConnectionDetail = a.Device!.HostDeviceId != null ? "Hosted" : (a.Device!.UpstreamConnection ?? a.Device!.ConnectionDetail),
                    UpName = a.Device!.HostDevice != null ? a.Device!.HostDevice!.Name : a.Device!.UpstreamDeviceName,
                    UpConn = a.Device!.HostDeviceId != null ? "Hosted" : a.Device!.UpstreamConnection,
                    Host = a.Device!.HostDevice != null ? a.Device!.HostDevice!.Name : null,
                    Location = a.Device!.LocationRef != null ? a.Device!.LocationRef!.Name : a.Device!.Location,
                    RackName = a.Device!.RackRef != null ? a.Device!.RackRef!.Name : null,
                    a.Device!.RackUPosition, a.Device!.RackUSize,
                    a.WentOfflineAtUtc, a.CameOnlineAtUtc
                })
                .ToListAsync(ct);
            var offlineAlerts = offlineRaw.Select(a => new
            {
                a.Id, a.DeviceId, name = a.Name, a.Hostname, ip = a.Ip,
                connectionType = a.ConnectionType, connectionDetail = a.ConnectionDetail,
                upstream = BuildUpstream(a.UpName, a.UpConn),
                host = a.Host, location = a.Location,
                rack = FormatRack(a.RackName, a.RackUPosition, a.RackUSize),
                wentOfflineAtUtc = Iso(a.WentOfflineAtUtc),
                cameOnlineAtUtc = Iso(a.CameOnlineAtUtc)
            }).ToList();

            var discoveryAlerts = (await discoveryBase
                .OrderByDescending(a => a.DetectedAtUtc).Take(10)
                .Select(a => new
                {
                    a.Id, a.Name, a.Hostname, a.Mac, a.IpAddress, a.ConnectionType, a.UpstreamDeviceName, a.UpstreamConnection, a.DetectedAtUtc
                })
                .ToListAsync(ct))
                .Select(a => new
                {
                    a.Id, a.Name, a.Hostname, a.Mac, ip = a.IpAddress, connectionType = a.ConnectionType,
                    upstream = a.UpstreamDeviceName, upstreamConnection = a.UpstreamConnection, detectedAtUtc = Iso(a.DetectedAtUtc)
                }).ToList();

            var firmwareAlerts = (await firmwareBase
                .OrderByDescending(a => a.DetectedAtUtc).Take(10)
                .Select(a => new
                {
                    a.Id,
                    Name = a.Device != null ? a.Device.Name : a.NameAtTime,
                    Mac = a.Device != null ? a.Device.MacAddress : a.MacAtTime,
                    Model = a.Device != null ? a.Device.Model : a.ModelAtTime,
                    a.CurrentVersion, a.TargetVersion, a.DetectedAtUtc
                })
                .ToListAsync(ct))
                .Select(a => new
                {
                    a.Id, a.Name, a.Mac, a.Model, current = a.CurrentVersion, target = a.TargetVersion,
                    detectedAtUtc = Iso(a.DetectedAtUtc)
                }).ToList();

            // ---- WAN ----
            var wan = new List<object>();
            var wanDown = false;
            if (settings.UiShowWanStatus)
            {
                var wanList = await db.WanInterfaceStatuses.AsNoTracking().ToListAsync(ct);
                wanDown = wanList.Any(w => w.IsUp == false);
                foreach (var g in wanList.GroupBy(w => w.GatewayName ?? w.GatewayMac ?? "Gateway")
                             .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
                {
                    var gl = g.ToList();
                    foreach (var w in gl.OrderBy(w => w.InterfaceName, StringComparer.OrdinalIgnoreCase))
                        wan.Add(new { gateway = g.Key, label = WanLabel(w, gl), isUp = w.IsUp, ip = string.IsNullOrWhiteSpace(w.IpAddress) ? null : w.IpAddress.Trim() });
                }
            }

            // ---- devices / subnets ----
            var all = await db.Devices.AsNoTracking()
                .Select(d => new
                {
                    d.Id, d.SubnetId, d.IpAddress, d.ConnectionType, d.IsOnline, d.IgnoreOffline, d.IsStatusTracked,
                    IsDevice = d.ClientType != null && d.ClientType.IsDevice
                })
                .ToListAsync(ct);

            var subnets = (await db.Subnets.AsNoTracking()
                .Select(s => new { s.Id, s.Name, s.Cidr, s.VlanId })
                .ToListAsync(ct))
                .OrderBy(s => s.VlanId ?? int.MaxValue).ThenBy(s => s.Cidr).ThenBy(s => s.Name).ToList();

            var subnetRows = subnets.Select(s =>
            {
                var usable = 0;
                var used = 0;
                if (!string.IsNullOrWhiteSpace(s.Cidr) && IpCidr.TryParseIPv4Cidr(s.Cidr.Trim(), out var info, out _))
                {
                    usable = (int)Math.Min(int.MaxValue, info.UsableAddresses);
                    var set = new HashSet<uint>();
                    foreach (var d in all.Where(d => d.SubnetId == s.Id))
                    {
                        var ex = ExtractFirstIPv4(d.IpAddress);
                        if (ex is null || !IpCidr.TryParseIPv4(ex, out var ip, out _)) continue;
                        if (ip < info.NetworkUInt || ip > info.BroadcastUInt) continue;
                        set.Add(ip);
                    }
                    used = set.Count;
                }
                var inSubnet = all.Where(d => d.SubnetId == s.Id).ToList();
                return new
                {
                    s.Id, name = s.Name ?? "", cidr = s.Cidr ?? "", s.VlanId,
                    usable, used, free = usable > 0 ? Math.Max(usable - used, 0) : 0,
                    clients = inSubnet.Count(d => !d.IsDevice),
                    devices = inSubnet.Count(d => d.IsDevice),
                    offline = inSubnet.Count(d => d.IsStatusTracked && !d.IsOnline && !d.IgnoreOffline)
                };
            }).ToList();

            // ---- critical devices + 24h timelines ----
            var critRaw = await db.Devices.AsNoTracking().Where(d => d.IsCritical)
                .Select(d => new
                {
                    d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress, d.AccessLink,
                    Type = d.ClientType != null ? d.ClientType.Name : null,
                    SubnetId = d.SubnetId, SubnetName = d.Subnet != null ? d.Subnet.Name : null,
                    d.ConnectionType,
                    ConnectionDetail = d.HostDeviceId != null ? "Hosted" : (d.UpstreamConnection ?? d.ConnectionDetail),
                    UpName = d.HostDevice != null ? d.HostDevice.Name : d.UpstreamDeviceName,
                    UpConn = d.HostDeviceId != null ? "Hosted" : d.UpstreamConnection,
                    Location = d.LocationRef != null ? d.LocationRef.Name : d.Location,
                    RackName = d.RackRef != null ? d.RackRef.Name : null,
                    d.RackUPosition, d.RackUSize,
                    d.IsOnline, d.IsStatusTracked
                })
                .ToListAsync(ct);
            var crit = critRaw
                .OrderBy(d => { var e = ExtractFirstIPv4(d.IpAddress); return e != null && IpCidr.TryParseIPv4(e, out var ip, out _) ? ip : uint.MaxValue; })
                .ThenBy(d => d.Name).ToList();

            var windowEnd = DateTime.UtcNow;
            var windowStart = windowEnd.AddHours(-24);
            var segmentsBy = new Dictionary<int, List<object>>();
            if (crit.Count > 0)
            {
                var ids = crit.Select(d => d.Id).ToList();
                var recent = await db.DeviceStatusEvents.AsNoTracking()
                    .Where(e => ids.Contains(e.DeviceId) && e.ChangedAtUtc >= windowStart && e.ChangedAtUtc <= windowEnd)
                    .OrderBy(e => e.ChangedAtUtc)
                    .Select(e => new { e.DeviceId, e.ChangedAtUtc, e.IsOnline })
                    .ToListAsync(ct);
                // Latest pre-window event per device, resolved on the server.
                var baseline = await db.DeviceStatusEvents.AsNoTracking()
                    .Where(e => ids.Contains(e.DeviceId) && e.ChangedAtUtc < windowStart)
                    .GroupBy(e => e.DeviceId)
                    .Select(g => new { DeviceId = g.Key, IsOnline = g.OrderByDescending(e => e.ChangedAtUtc).Select(e => e.IsOnline).First() })
                    .ToDictionaryAsync(x => x.DeviceId, x => (bool?)x.IsOnline, ct);
                var recentBy = recent.GroupBy(e => e.DeviceId).ToDictionary(g => g.Key, g => g.ToList());
                var totalMin = Math.Max(1, (windowEnd - windowStart).TotalMinutes);

                foreach (var d in crit)
                {
                    bool? current = baseline.TryGetValue(d.Id, out var b) ? b : d.IsStatusTracked ? d.IsOnline : null;
                    var segs = new List<object>();
                    var cursor = windowStart;
                    void Add(DateTime from, DateTime to, bool? st)
                    {
                        var min = (to - from).TotalMinutes;
                        if (min <= 0) return;
                        segs.Add(new { kind = st is null ? "unknown" : st.Value ? "online" : "offline", pct = Math.Round(min * 100.0 / totalMin, 3) });
                    }
                    if (recentBy.TryGetValue(d.Id, out var pts))
                        foreach (var p in pts)
                        {
                            if (p.ChangedAtUtc <= windowStart) { current = p.IsOnline; continue; }
                            if (p.ChangedAtUtc >= windowEnd) break;
                            Add(cursor, p.ChangedAtUtc, current);
                            current = p.IsOnline;
                            cursor = p.ChangedAtUtc;
                        }
                    Add(cursor, windowEnd, current);
                    segmentsBy[d.Id] = segs;
                }
            }

            var criticalDevices = crit.Select(d => new
            {
                d.Id, d.Name, d.Type, d.Hostname, ip = d.IpAddress, d.MacAddress,
                accessLink = TryAccessLink(d.AccessLink, out var href) ? href : null,
                d.SubnetId, subnet = d.SubnetName,
                d.ConnectionType, connectionDetail = d.ConnectionDetail,
                upstream = BuildUpstream(d.UpName, d.UpConn),
                d.Location, rack = FormatRack(d.RackName, d.RackUPosition, d.RackUSize),
                d.IsOnline, d.IsStatusTracked,
                timeline = segmentsBy.TryGetValue(d.Id, out var s) ? s : new List<object>()
            }).ToList();

            var offlineClients = all.Count(d => d.IsStatusTracked && !d.IsOnline && !d.IgnoreOffline);
            var clientTypes = await db.ClientTypes.AsNoTracking().OrderBy(t => t.Name)
                .Select(t => new { t.Id, t.Name }).ToListAsync(ct);

            return Results.Ok(new
            {
                nowUtc = Iso(DateTime.UtcNow),
                settings = new
                {
                    autoRefreshSeconds = settings.UiAutoRefreshSeconds,
                    showWanStatus = settings.UiShowWanStatus,
                    dateFormat = settings.DateFormat
                },
                updater = new
                {
                    lastRunUtc = Iso(updater.LastRunUtc),
                    lastError = string.IsNullOrWhiteSpace(updater.LastError) ? null : updater.LastError,
                    lastChangedCount = updater.LastChangedCount
                },
                totals = new
                {
                    clients = all.Count(d => !d.IsDevice),
                    devices = all.Count(d => d.IsDevice),
                    wired = all.Count(d => IsWired(d.ConnectionType)),
                    wifi = all.Count(d => IsWifi(d.ConnectionType)),
                    offlineClients,
                    offlineAlerts = offlineCount,
                    discoveryAlerts = discoveryCount,
                    firmwareAlerts = firmwareCount,
                    wanDown
                },
                wan,
                subnets = subnetRows,
                offlineAlerts,
                discoveryAlerts,
                firmwareAlerts,
                criticalDevices,
                windowStartUtc = Iso(windowStart),
                windowEndUtc = Iso(windowEnd),
                clientTypes
            });
        });

        // Discovery "Add" / "Edit & Add": create the device from the alert and acknowledge it.
        api.MapPost("/dashboard/discovery/{id:int}/add", async (int id, AddDiscoveryRequest? req, AppDbContext db, CancellationToken ct) =>
        {
            var alert = await db.ClientDiscoveryAlerts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (alert is null) return Results.NotFound(new { error = "Alert not found." });

            var mac = UnifiParsers.NormalizeMac(string.IsNullOrWhiteSpace(req?.MacAddress) ? alert.Mac : req!.MacAddress);
            var name = string.IsNullOrWhiteSpace(req?.Name) ? (alert.Name ?? alert.Mac) : req!.Name!.Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name is required." });

            var ip = req?.IpAddress is null ? alert.IpAddress : (string.IsNullOrWhiteSpace(req.IpAddress) ? null : req.IpAddress.Trim());
            var device = new Device
            {
                Name = name,
                Hostname = req?.Hostname is null ? alert.Hostname : (string.IsNullOrWhiteSpace(req.Hostname) ? null : req.Hostname.Trim()),
                MacAddress = mac,
                IpAddress = ip,
                ConnectionType = alert.ConnectionType,
                ConnectionDetail = alert.ConnectionDetail,
                UpstreamDeviceName = req?.UpstreamDeviceName is null ? alert.UpstreamDeviceName : (string.IsNullOrWhiteSpace(req.UpstreamDeviceName) ? null : req.UpstreamDeviceName.Trim()),
                UpstreamDeviceMac = string.IsNullOrWhiteSpace(alert.UpstreamDeviceMac) ? null : UnifiParsers.NormalizeMac(alert.UpstreamDeviceMac),
                UpstreamConnection = req?.UpstreamConnection is null ? alert.UpstreamConnection : (string.IsNullOrWhiteSpace(req.UpstreamConnection) ? null : req.UpstreamConnection.Trim()),
                IsOnline = alert.IsOnline,
                ClientTypeId = req?.ClientTypeId
            };
            device.SubnetId = await SubnetResolver.ResolveSubnetIdForIpAsync(db, device.IpAddress);

            var exists = await db.Devices.AnyAsync(d => d.MacAddress == device.MacAddress, ct);
            if (!exists) db.Devices.Add(device);

            alert.IsAcknowledged = true;
            alert.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true, added = !exists });
        }).RequireAuthorization("CanEdit");
    }
}
