using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Helpers;

namespace Netipam.Api;

public sealed class TopologyApi : IApiModule
{
    public void Map(RouteGroupBuilder api)
    {
        api.MapGet("/topology", async (AppDbContext db) =>
        {
            var devices = await db.Devices.AsNoTracking()
                .Include(d => d.ClientType)
                .OrderBy(d => d.Name)
                .ToListAsync();

            var byId = devices.ToDictionary(d => d.Id);
            var byName = BuildNameLookup(devices);
            var byMac = BuildMacLookup(devices);

            var nodes = devices.Select(d =>
            {
                var parent = ResolveParent(d, byId, byName, byMac);
                var upstreamName = parent?.Name ?? d.UpstreamDeviceName ?? ExtractUpstreamNameFromDetail(d.ConnectionDetail);
                var upstreamConn = d.HostDeviceId is not null ? "Hosted" : d.UpstreamConnection ?? d.ConnectionDetail;
                var isGateway = IsGateway(d);
                var unassigned = parent is null
                    && string.IsNullOrWhiteSpace(upstreamName)
                    && string.IsNullOrWhiteSpace(upstreamConn)
                    && !d.IsTopologyRoot
                    && !isGateway;
                var isRoot = !unassigned && (d.IsTopologyRoot || parent is null);
                var accessHref = DisplayFormat.TryBuildAccessLink(d.AccessLink, out var href) ? href : null;
                var tooltip = DisplayFormat.Safe(d.ConnectionType);
                var cd = DisplayFormat.Safe(upstreamConn);
                if (cd != "-") tooltip = $"{tooltip} | {cd}";

                return new
                {
                    id = d.Id,
                    name = d.Name,
                    hostname = d.Hostname,
                    ipAddress = DisplayFormat.FormatIpWithPort(d),
                    macAddress = d.MacAddress,
                    type = d.ClientType?.Name,
                    accessHref,
                    isOnline = d.IsOnline,
                    isStatusTracked = d.IsStatusTracked,
                    isTopologyRoot = d.IsTopologyRoot,
                    isHosted = d.HostDeviceId is not null,
                    parentId = parent?.Id,
                    parentName = parent?.Name,
                    port = ExtractPort(upstreamConn),
                    isWifi = IsWifi(d, upstreamConn),
                    wifiBand = WifiBand(upstreamConn),
                    connectionType = d.ConnectionType,
                    connectionDetail = upstreamConn,
                    connectionTooltip = tooltip,
                    upstreamName,
                    upstreamMac = d.UpstreamDeviceMac,
                    searchText = string.Join("\n", new[]
                    {
                        d.Name, d.Hostname, d.IpAddress, d.MacAddress, d.ClientType?.Name,
                        d.UpstreamDeviceName, d.ConnectionDetail
                    }.Where(s => !string.IsNullOrWhiteSpace(s))),
                    kind = unassigned ? "unassigned" : isRoot ? "root" : "child",
                };
            }).ToList();

            return Results.Ok(new { nodes });
        });

        api.MapGet("/hosts", async (AppDbContext db) =>
        {
            var hostDevices = await db.Devices.AsNoTracking()
                .Include(d => d.ClientType)
                .Where(d => d.ClientType != null && d.ClientType.IsHost)
                .OrderBy(d => d.Name)
                .ToListAsync();
            var hostIds = hostDevices.Select(h => h.Id).ToList();
            var guests = await db.Devices.AsNoTracking()
                .Include(d => d.ClientType)
                .Where(d => d.HostDeviceId != null && hostIds.Contains(d.HostDeviceId.Value))
                .OrderBy(d => d.Name)
                .ToListAsync();

            static object Dto(Device d) => new
            {
                id = d.Id,
                name = d.Name,
                hostname = d.Hostname,
                type = d.ClientType?.Name,
                ipAddress = DisplayFormat.FormatIpWithPort(d),
                accessHref = DisplayFormat.TryBuildAccessLink(d.AccessLink, out var h) ? h : null,
                isOnline = d.IsOnline,
                isStatusTracked = d.IsStatusTracked,
                isProxmox = d.IsProxmoxHost || d.ProxmoxInstanceId != null,
            };

            var hosts = hostDevices.Select(h =>
            {
                var g = guests.Where(x => x.HostDeviceId == h.Id).Select(Dto).ToList();
                return new { host = Dto(h), guests = g };
            }).ToList();
            return Results.Ok(new { hosts });
        });
    }

    private static Device? ResolveParent(Device d, Dictionary<int, Device> byId,
        Dictionary<string, Device> byName, Dictionary<string, Device> byMac)
    {
        if (d.IsTopologyRoot) return null;
        if (d.HostDeviceId is int hid && byId.TryGetValue(hid, out var host)) return host;
        if (d.ManualUpstreamDeviceId is int mid && byId.TryGetValue(mid, out var manual)) return manual;
        if (d.ParentDeviceId is int pid && byId.TryGetValue(pid, out var p1)) return p1;
        if (!string.IsNullOrWhiteSpace(d.UpstreamDeviceName) && byName.TryGetValue(d.UpstreamDeviceName.Trim(), out var p2))
            return p2;
        var parsed = ExtractUpstreamNameFromDetail(d.ConnectionDetail);
        if (!string.IsNullOrWhiteSpace(parsed) && byName.TryGetValue(parsed, out var p4)) return p4;
        var mac = NormalizeMac(d.UpstreamDeviceMac);
        if (!string.IsNullOrWhiteSpace(mac) && byMac.TryGetValue(mac, out var p3)) return p3;
        return null;
    }

    private static int? ExtractPort(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail)) return null;
        foreach (var p in detail.Split('|', StringSplitOptions.RemoveEmptyEntries).Select(p => p.Trim()))
        {
            if (p.StartsWith("port", StringComparison.OrdinalIgnoreCase))
            {
                var tokens = p.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (tokens.Length >= 2 && int.TryParse(tokens[^1], out var num)) return num;
            }
        }
        return null;
    }

    private static bool IsWifi(Device d, string? connection)
    {
        if (!string.IsNullOrWhiteSpace(d.ConnectionType) &&
            d.ConnectionType.Trim().Equals("wifi", StringComparison.OrdinalIgnoreCase))
            return true;
        var conn = connection ?? "";
        return conn.Contains("ghz", StringComparison.OrdinalIgnoreCase) ||
               conn.Contains("wifi", StringComparison.OrdinalIgnoreCase) ||
               conn.Contains('@');
    }

    // Mirrors DisplayFormat.GetWifiColor: 2.4 -> warn, 6 -> ok, else info.
    private static string? WifiBand(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail)) return null;
        var d = detail.ToLowerInvariant();
        if (d.Contains("2.4") || d.Contains("2g")) return "2.4";
        if (d.Contains('6')) return "6";
        return "5";
    }

    private static bool IsGateway(Device d)
    {
        var t = d.ClientType?.Name ?? "";
        return t.Contains("gateway", StringComparison.OrdinalIgnoreCase) ||
               t.Contains("router", StringComparison.OrdinalIgnoreCase);
    }

    private static Dictionary<string, Device> BuildNameLookup(IEnumerable<Device> devices)
    {
        var dict = new Dictionary<string, Device>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in devices.Where(d => !string.IsNullOrWhiteSpace(d.Name)))
            dict.TryAdd(d.Name.Trim(), d);
        return dict;
    }

    private static Dictionary<string, Device> BuildMacLookup(IEnumerable<Device> devices)
    {
        var dict = new Dictionary<string, Device>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in devices)
        {
            var key = NormalizeMac(d.MacAddress);
            if (!string.IsNullOrWhiteSpace(key)) dict.TryAdd(key, d);
        }
        return dict;
    }

    private static string NormalizeMac(string? raw)
        => string.IsNullOrWhiteSpace(raw) ? "" : new string(raw.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    private static string? ExtractUpstreamNameFromDetail(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail)) return null;
        var t = detail.Trim();
        var pipe = t.IndexOf('|', StringComparison.Ordinal);
        if (pipe > 0) return t[..pipe].Trim();
        var paren = t.IndexOf(" (", StringComparison.Ordinal);
        if (paren > 0) return t[..paren].Trim();
        return null;
    }
}
