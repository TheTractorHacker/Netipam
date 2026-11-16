using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MudBlazor;
using Netipam.Data;
using Netipam.Helpers;
using Netipam.Services;

namespace Netipam.Api;

/// <summary>Devices + clients: list, detail, create/update/delete, form lookups and per-user column preferences.</summary>
public sealed class DevicesApi : IApiModule
{
    private static readonly string[] ColumnPages = { "Devices", "Clients" };

    /// <summary>Everything the list, card, drawer and edit form need for one device/client.</summary>
    public sealed record DeviceDto(
        int Id, string Name, string? Hostname, string? IpAddress, string? MacAddress,
        string? AccessLink, string? AccessHref, int? AccessCategoryId, string? AccessCategory,
        int? ClientTypeId, string? Type, bool IsDevice,
        int? SubnetId, string? Subnet,
        int? LocationId, string? Location,
        int? RackId, string? RackName, int? RackUPosition, int? RackUSize, string? Rack,
        string? AssetNumber, string? Manufacturer, string? Model, string? OperatingSystem,
        string? Source, string? UsedNew, string? SourceDate, string? SourceDateText,
        string? Description,
        int? HostDeviceId, string? HostDeviceName, bool IsProxmoxHost, int? ProxmoxInstanceId, string? ProxmoxInstance, string? ProxmoxNodeIdentifier,
        bool IsTopologyRoot, int? ManualUpstreamDeviceId, string? ManualUpstreamName,
        string? Upstream, string? ConnectionType, string? ConnectionDetail, string? ConnectionTooltip, string? WifiTone,
        bool IsOnline, bool IsStatusTracked, bool IsCritical, bool IgnoreOffline,
        string MonitorMode, int? MonitorPort, bool MonitorUseHttps, string? MonitorHttpPath,
        string? IpDisplay, string? IpTooltip, bool InDhcp,
        DateTime? LastSeenAt, DateTime? LastOnlineAt);

    public sealed record DeviceInput(
        string? Kind, string? Name, int? ClientTypeId, int? HostDeviceId,
        bool IsProxmoxHost, int? ProxmoxInstanceId, string? ProxmoxNodeIdentifier,
        bool IsTopologyRoot, bool IsCritical,
        string? AssetNumber, string? Hostname, string? IpAddress, string? MacAddress,
        bool IsStatusTracked, bool IgnoreOffline,
        string? MonitorMode, int? MonitorPort, bool MonitorUseHttps, string? MonitorHttpPath,
        int? ManualUpstreamDeviceId, int? LocationId, int? RackId, int? RackUPosition, int? RackUSize,
        string? Manufacturer, string? Model, string? OperatingSystem,
        string? Source, string? UsedNew, string? SourceDate,
        string? AccessLink, int? AccessCategoryId, string? Description);

    public sealed record ColumnPref(string Key, bool Visible);
    public sealed record ColumnsRequest(string? Page, List<ColumnPref>? Columns);

    public void Map(RouteGroupBuilder api)
    {
        // ---------- List ----------
        api.MapGet("/devices", async (string? kind, string? q, AppDbContext db, CancellationToken ct) =>
        {
            var query = WithIncludes(db.Devices.AsNoTracking());
            if (kind == "device") query = query.Where(d => d.ClientType != null && d.ClientType.IsDevice);
            else if (kind == "client") query = query.Where(d => d.ClientType == null || !d.ClientType.IsDevice);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim().ToLower();
                query = query.Where(d =>
                    d.Name.ToLower().Contains(term) ||
                    (d.IpAddress != null && d.IpAddress.Contains(term)) ||
                    (d.MacAddress != null && d.MacAddress.ToLower().Contains(term)) ||
                    (d.Hostname != null && d.Hostname.ToLower().Contains(term)));
            }

            var list = await query.OrderBy(d => d.Name).ToListAsync(ct);
            return Results.Ok(list.Select(ToDto).ToList());
        });

        // ---------- Form lookups ----------
        api.MapGet("/devices/options", async (AppDbContext db, AppSettingsService settings, CancellationToken ct) =>
        {
            var subnets = await db.Subnets.AsNoTracking().OrderBy(s => s.Name)
                .Select(s => new { s.Id, s.Name, s.Cidr }).ToListAsync(ct);
            var locations = await db.Locations.AsNoTracking().OrderBy(l => l.Name)
                .Select(l => new { l.Id, l.Name }).ToListAsync(ct);
            var racks = await db.Racks.AsNoTracking().OrderBy(r => r.Name)
                .Select(r => new { r.Id, r.Name, r.LocationId, r.RackUnits }).ToListAsync(ct);
            var clientTypes = await db.ClientTypes.AsNoTracking().OrderBy(t => t.Name)
                .Select(t => new { t.Id, t.Name, t.IsDevice, t.IsHost }).ToListAsync(ct);
            var accessCategories = await db.AccessCategories.AsNoTracking().OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name }).ToListAsync(ct);
            var proxmoxInstances = await db.ProxmoxInstances.AsNoTracking().OrderBy(p => p.Name)
                .Select(p => new { p.Id, p.Name }).ToListAsync(ct);

            var hostRows = await db.Devices.AsNoTracking()
                .Where(d => (d.ClientType != null && d.ClientType.IsHost) || d.IsProxmoxHost)
                .OrderBy(d => d.Name)
                .Select(d => new { d.Id, d.Name, d.Hostname, d.IpAddress })
                .ToListAsync(ct);
            var hosts = hostRows.Select(d => new { d.Id, Label = DeviceLabel(d.Id, d.Name, d.Hostname, d.IpAddress, "Host") }).ToList();

            var allRows = await db.Devices.AsNoTracking().OrderBy(d => d.Name)
                .Select(d => new { d.Id, d.Name, d.Hostname, d.IpAddress })
                .ToListAsync(ct);
            var upstream = allRows.Select(d => new { d.Id, Label = DeviceLabel(d.Id, d.Name, d.Hostname, d.IpAddress, "Device") }).ToList();

            var s = await settings.LoadAsync(ct);

            return Results.Ok(new
            {
                subnets, locations, racks, clientTypes, accessCategories, proxmoxInstances,
                hosts, upstreamDevices = upstream,
                uiAutoRefreshSeconds = s.UiAutoRefreshSeconds,
                showLastSeenTooltips = s.ShowLastSeenTooltips,
                monitorModes = Enum.GetNames<DeviceMonitorMode>()
            });
        });

        // ---------- Detail ----------
        api.MapGet("/devices/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var d = await WithIncludes(db.Devices.AsNoTracking()).FirstOrDefaultAsync(x => x.Id == id, ct);
            return d is null ? Results.NotFound(new { error = "Device not found." }) : Results.Ok(ToDto(d));
        });

        // ---------- Create ----------
        api.MapPost("/devices", async (DeviceInput input, AppDbContext db, CancellationToken ct) =>
        {
            var d = new Device { IsStatusTracked = true };
            var err = await ApplyAsync(db, d, input, isNew: true, ct);
            if (err is not null) return err;

            db.Devices.Add(d);
            await db.SaveChangesAsync(ct);
            await IpHistoryHelper.TrackIpChangeAsync(db, d, "Manual", DateTime.UtcNow, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = d.Id });
        }).RequireAuthorization("CanEdit");

        // ---------- Update ----------
        api.MapPut("/devices/{id:int}", async (int id, DeviceInput input, AppDbContext db, CancellationToken ct) =>
        {
            var d = await db.Devices.Include(x => x.ClientType).FirstOrDefaultAsync(x => x.Id == id, ct);
            if (d is null) return Results.NotFound(new { error = "Device not found." });

            var err = await ApplyAsync(db, d, input, isNew: false, ct);
            if (err is not null) return err;

            await db.SaveChangesAsync(ct);
            await IpHistoryHelper.TrackIpChangeAsync(db, d, "Manual", DateTime.UtcNow, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = d.Id });
        }).RequireAuthorization("CanEdit");

        // ---------- Delete ----------
        api.MapDelete("/devices/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var d = await db.Devices.FindAsync(new object[] { id }, ct);
            if (d is null) return Results.NotFound(new { error = "Device not found." });
            db.Devices.Remove(d);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true, name = d.Name });
        }).RequireAuthorization("CanEdit");

        // ---------- Column preferences (per user) ----------
        api.MapGet("/devices/columns", async (string? page, ClaimsPrincipal user, AppDbContext db, CancellationToken ct) =>
        {
            var pageKey = NormalizePage(page);
            if (pageKey is null) return Results.BadRequest(new { error = "Unknown page." });
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            var result = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(userId))
            {
                var prefs = await db.UserColumnPreferences.AsNoTracking()
                    .Where(p => p.UserId == userId && p.PageKey == pageKey)
                    .ToListAsync(ct);
                foreach (var p in prefs) result[p.ColumnKey] = p.IsVisible;
            }
            return Results.Ok(new { page = pageKey, saved = result.Count > 0, columns = result });
        });

        api.MapPut("/devices/columns", async (ColumnsRequest req, ClaimsPrincipal user, AppDbContext db, CancellationToken ct) =>
        {
            var pageKey = NormalizePage(req.Page);
            if (pageKey is null) return Results.BadRequest(new { error = "Unknown page." });
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest(new { error = "No user." });

            if ((req.Columns ?? new()).Any(c => c.Key is not null && (c.Key.Trim().Length > 64 || c.Key.Any(char.IsControl))))
                return Results.BadRequest(new { error = "Column key is invalid or too long (max 64)." });

            var existing = await db.UserColumnPreferences
                .Where(p => p.UserId == userId && p.PageKey == pageKey)
                .ToListAsync(ct);
            if (existing.Count > 0) db.UserColumnPreferences.RemoveRange(existing);

            var now = DateTime.UtcNow;
            foreach (var c in (req.Columns ?? new()).Where(c => !string.IsNullOrWhiteSpace(c.Key)).DistinctBy(c => c.Key.Trim()))
            {
                db.UserColumnPreferences.Add(new UserColumnPreference
                {
                    UserId = userId, PageKey = pageKey, ColumnKey = c.Key.Trim(),
                    IsVisible = c.Visible, UpdatedAtUtc = now
                });
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });
    }

    private static string? NormalizePage(string? page)
        => ColumnPages.FirstOrDefault(p => string.Equals(p, page?.Trim(), StringComparison.OrdinalIgnoreCase));

    private static IQueryable<Device> WithIncludes(IQueryable<Device> q)
        => q.Include(d => d.Subnet).Include(d => d.ClientType).Include(d => d.HostDevice)
            .Include(d => d.LocationRef).Include(d => d.RackRef).Include(d => d.AccessCategory)
            .Include(d => d.ProxmoxInstance).Include(d => d.ManualUpstreamDevice);

    // ---------- Mapping ----------
    private static DeviceDto ToDto(Device d)
    {
        var upName = d.HostDevice?.Name ?? d.UpstreamDeviceName;
        var upConn = d.HostDevice is not null ? "Hosted" : d.UpstreamConnection;
        var connDetail = upConn ?? d.ConnectionDetail;
        var isWifi = !string.IsNullOrWhiteSpace(d.ConnectionType)
                     && d.ConnectionType.Trim().Equals("WiFi", StringComparison.OrdinalIgnoreCase);
        string? wifiTone = null;
        if (isWifi)
        {
            wifiTone = DisplayFormat.GetWifiColor(connDetail) switch
            {
                Color.Warning => "warn",
                Color.Success => "ok",
                Color.Info => "info",
                _ => null
            };
        }

        string? ipDisplay = null, ipTip = null;
        if (!string.IsNullOrWhiteSpace(d.IpAddress) && d.MonitorPort is not null
            && (DisplayFormat.UsesPort(d.MonitorMode) || DisplayFormat.UsesHttp(d.MonitorMode)))
        {
            ipDisplay = $"{d.IpAddress}:{d.MonitorPort}";
            ipTip = MonitorTooltip(d);
        }

        DisplayFormat.TryBuildAccessLink(d.AccessLink, out var href);

        return new DeviceDto(
            d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress,
            d.AccessLink, string.IsNullOrEmpty(href) ? null : href, d.AccessCategoryId, d.AccessCategory?.Name,
            d.ClientTypeId, d.ClientType?.Name, d.ClientType?.IsDevice == true,
            d.SubnetId, d.Subnet?.Name,
            d.LocationId, d.LocationRef?.Name ?? (string.IsNullOrWhiteSpace(d.Location) ? null : d.Location),
            d.RackId, d.RackRef?.Name, d.RackUPosition, d.RackUSize, DisplayFormat.FormatRack(d, null),
            d.AssetNumber, d.Manufacturer, d.Model, d.OperatingSystem,
            d.Source, d.UsedNew,
            d.SourceDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            d.SourceDate?.ToString("MMM-yyyy", CultureInfo.InvariantCulture),
            d.Description,
            d.HostDeviceId, d.HostDevice?.Name, d.IsProxmoxHost, d.ProxmoxInstanceId, d.ProxmoxInstance?.Name, d.ProxmoxNodeIdentifier,
            d.IsTopologyRoot, d.ManualUpstreamDeviceId, d.ManualUpstreamDevice?.Name,
            DisplayFormat.BuildUpstreamDisplay(upName, upConn, d.ConnectionDetail),
            d.ConnectionType, d.ConnectionDetail,
            string.IsNullOrWhiteSpace(d.ConnectionType) ? null : DisplayFormat.GetConnTooltip(d), wifiTone,
            d.IsOnline, d.IsStatusTracked, d.IsCritical, d.IgnoreOffline,
            d.MonitorMode.ToString(), d.MonitorPort, d.MonitorUseHttps, d.MonitorHttpPath,
            ipDisplay, ipTip, IsInDhcpRange(d),
            Utc(d.LastSeenAt), Utc(d.LastOnlineAt));
    }

    private static DateTime? Utc(DateTime? v) => v is null ? null : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc);

    private static string MonitorTooltip(Device d)
    {
        var port = d.MonitorPort?.ToString() ?? "-";
        if (DisplayFormat.UsesHttp(d.MonitorMode))
        {
            var scheme = d.MonitorUseHttps ? "https" : "http";
            var path = string.IsNullOrWhiteSpace(d.MonitorHttpPath) ? "/" : d.MonitorHttpPath.Trim();
            return $"HTTP check: {scheme}://{d.IpAddress}:{port}{path}";
        }
        if (DisplayFormat.UsesPort(d.MonitorMode)) return $"TCP port check: {port}";
        return "Ping only";
    }

    private static bool IsInDhcpRange(Device d)
    {
        if (d.Subnet is null) return false;
        var start = d.Subnet.DhcpRangeStart;
        var end = d.Subnet.DhcpRangeEnd;
        var ip = d.IpAddress;
        if (string.IsNullOrWhiteSpace(start) || string.IsNullOrWhiteSpace(end) || string.IsNullOrWhiteSpace(ip)) return false;
        if (!IpCidr.TryParseIPv4(start, out var s, out _)) return false;
        if (!IpCidr.TryParseIPv4(end, out var e, out _)) return false;
        if (!IpCidr.TryParseIPv4(ip, out var i, out _)) return false;
        return i >= Math.Min(s, e) && i <= Math.Max(s, e);
    }

    private static string DeviceLabel(int id, string? name, string? hostname, string? ip, string fallback)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(name)) parts.Add(name.Trim());
        if (!string.IsNullOrWhiteSpace(hostname)) parts.Add(hostname.Trim());
        if (!string.IsNullOrWhiteSpace(ip)) parts.Add(ip.Trim());
        return parts.Count switch
        {
            0 => $"{fallback} #{id}",
            1 => parts[0],
            _ => $"{parts[0]} ({string.Join(" • ", parts.Skip(1))})"
        };
    }

    // ---------- Validation + apply (mirrors Add/EditDeviceDialog.Save) ----------
    private static IResult Invalid(string field, string message)
        => Results.BadRequest(new { error = message, errors = new Dictionary<string, string> { [field] = message } });

    private static string? Trim(string? s) => s?.Trim();
    private static string? TrimOrNull(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static async Task<IResult?> ApplyAsync(AppDbContext db, Device d, DeviceInput i, bool isNew, CancellationToken ct)
    {
        var name = Trim(i.Name);
        if (string.IsNullOrWhiteSpace(name)) return Invalid("name", "Name is required.");
        if (name.Length > 200) return Invalid("name", "Name is too long (max 200).");

        // Text field validation: no control characters (NUL etc.), bounded lengths (match column sizes)
        var textChecks = new (string Field, string? Value, int Max, bool Multiline)[]
        {
            ("name", name, 200, false), ("hostname", i.Hostname, 255, false), ("ipAddress", i.IpAddress, 64, false),
            ("macAddress", i.MacAddress, 32, false), ("assetNumber", i.AssetNumber, 200, false),
            ("manufacturer", i.Manufacturer, 200, false), ("model", i.Model, 200, false),
            ("operatingSystem", i.OperatingSystem, 200, false), ("source", i.Source, 64, false),
            ("usedNew", i.UsedNew, 64, false), ("sourceDate", i.SourceDate, 32, false),
            ("proxmoxNodeIdentifier", i.ProxmoxNodeIdentifier, 128, false),
            ("monitorHttpPath", i.MonitorHttpPath, 512, false), ("accessLink", i.AccessLink, 2048, false),
            ("description", i.Description, 2000, true),
        };
        foreach (var (field, value, max, multiline) in textChecks)
        {
            if (string.IsNullOrEmpty(value)) continue;
            if (value.Trim().Length > max) return Invalid(field, $"Too long (max {max}).");
            if (value.Any(c => char.IsControl(c) && !(multiline && (c == '\n' || c == '\r' || c == '\t'))))
                return Invalid(field, "Contains invalid control characters.");
        }

        var devicesOnly = string.Equals(i.Kind, "device", StringComparison.OrdinalIgnoreCase);

        // Client type
        var clientTypes = await db.ClientTypes.AsNoTracking().ToListAsync(ct);
        if (i.ClientTypeId is not null && clientTypes.All(t => t.Id != i.ClientTypeId))
            return Invalid("clientTypeId", "Unknown type.");
        if (isNew && devicesOnly && i.ClientTypeId is not null
            && !clientTypes.First(t => t.Id == i.ClientTypeId).IsDevice)
            return Invalid("clientTypeId", "Choose a device type.");

        // Proxmox
        var proxmoxNode = TrimOrNull(i.ProxmoxNodeIdentifier);
        if (i.IsProxmoxHost)
        {
            if (i.ProxmoxInstanceId is null) return Invalid("proxmoxInstanceId", "Proxmox instance is required.");
            if (proxmoxNode is null) return Invalid("proxmoxNodeIdentifier", "Proxmox node identifier is required.");
            if (!await db.ProxmoxInstances.AnyAsync(p => p.Id == i.ProxmoxInstanceId, ct))
                return Invalid("proxmoxInstanceId", "Unknown Proxmox instance.");
        }

        // Monitor
        var mode = DeviceMonitorMode.Normal;
        if (!string.IsNullOrWhiteSpace(i.MonitorMode) && !Enum.TryParse(i.MonitorMode, true, out mode))
            return Invalid("monitorMode", "Unknown monitor mode.");
        var usesPort = DisplayFormat.UsesPort(mode);
        var usesHttp = DisplayFormat.UsesHttp(mode);
        if ((usesPort || usesHttp) && i.MonitorPort is null)
            return Invalid("monitorPort", "Port is required for this monitor mode.");
        if (i.MonitorPort is not null && (i.MonitorPort < 1 || i.MonitorPort > 65535))
            return Invalid("monitorPort", "Port must be 1-65535.");

        // Rack
        if (i.RackId is not null)
        {
            if (!await db.Racks.AnyAsync(r => r.Id == i.RackId, ct)) return Invalid("rackId", "Unknown rack.");
            if (i.RackUPosition is not null && (i.RackUPosition < 1 || i.RackUPosition > 60))
                return Invalid("rackUPosition", "U position must be 1-60.");
            if (i.RackUSize is not null && (i.RackUSize < 1 || i.RackUSize > 10))
                return Invalid("rackUSize", "U size must be 1-10.");
        }

        // Source date (Month-Year only)
        DateOnly? sourceDate = null;
        if (!string.IsNullOrWhiteSpace(i.SourceDate))
        {
            if (!TryParseMonthYear(i.SourceDate.Trim(), out var sd)) return Invalid("sourceDate", "Use format like Aug-2025.");
            sourceDate = sd;
        }

        // MAC is a unique index: empty must be null, duplicates need a friendly message
        var mac = TrimOrNull(i.MacAddress);
        if (mac is not null)
        {
            var lower = mac.ToLower();
            var clash = await db.Devices.AsNoTracking()
                .Where(x => x.MacAddress != null && x.MacAddress.ToLower() == lower && x.Id != d.Id)
                .Select(x => x.Name).FirstOrDefaultAsync(ct);
            if (clash is not null) return Invalid("macAddress", $"MAC address already used by '{clash}'.");
        }

        // Relationship guards (cannot host/route through yourself)
        var hostId = i.HostDeviceId;
        if (!isNew && hostId == d.Id) hostId = null;
        if (hostId is not null && !await db.Devices.AnyAsync(x => x.Id == hostId, ct)) hostId = null;
        var manualUp = i.IsTopologyRoot ? null : i.ManualUpstreamDeviceId;
        if (!isNew && manualUp == d.Id) manualUp = null;
        if (manualUp is not null && !await db.Devices.AnyAsync(x => x.Id == manualUp, ct)) manualUp = null;

        // Reject ancestor cycles (same precedence as /topology: host, then manual upstream)
        if (!i.IsTopologyRoot && (hostId ?? manualUp) is int firstParent && !isNew)
        {
            var links = await db.Devices.AsNoTracking()
                .Select(x => new { x.Id, x.HostDeviceId, x.ManualUpstreamDeviceId, x.IsTopologyRoot })
                .ToDictionaryAsync(x => x.Id, ct);
            var seen = new HashSet<int>();
            int? cur = firstParent;
            while (cur is int c && seen.Add(c))
            {
                if (c == d.Id)
                    return Invalid(hostId is not null ? "hostDeviceId" : "manualUpstreamDeviceId",
                        "That would create a loop (the device would be upstream of itself).");
                cur = links.TryGetValue(c, out var l) && !l.IsTopologyRoot ? l.HostDeviceId ?? l.ManualUpstreamDeviceId : null;
            }
        }

        // Location text is denormalised from the location row
        string? locationText = null;
        if (i.LocationId is not null)
        {
            locationText = await db.Locations.AsNoTracking().Where(l => l.Id == i.LocationId).Select(l => l.Name).FirstOrDefaultAsync(ct);
            if (locationText is null) return Invalid("locationId", "Unknown location.");
        }

        // ---- assign ----
        d.Name = name;
        d.ClientTypeId = i.ClientTypeId;
        d.HostDeviceId = hostId;
        d.IsProxmoxHost = i.IsProxmoxHost;
        d.ProxmoxInstanceId = i.IsProxmoxHost ? i.ProxmoxInstanceId : null;
        d.ProxmoxNodeIdentifier = i.IsProxmoxHost ? proxmoxNode : null;
        d.IsTopologyRoot = i.IsTopologyRoot;
        d.IsCritical = i.IsCritical;
        d.AssetNumber = TrimOrNull(i.AssetNumber);
        d.Hostname = TrimOrNull(i.Hostname);
        d.IpAddress = TrimOrNull(i.IpAddress);
        d.MacAddress = mac;
        d.IsStatusTracked = i.IsStatusTracked;
        d.IgnoreOffline = i.IgnoreOffline;

        d.MonitorMode = mode;
        if (mode == DeviceMonitorMode.Normal)
        {
            d.MonitorPort = null; d.MonitorUseHttps = false; d.MonitorHttpPath = null;
        }
        else
        {
            d.MonitorPort = usesPort || usesHttp ? i.MonitorPort : null;
            d.MonitorUseHttps = usesHttp && i.MonitorUseHttps;
            d.MonitorHttpPath = usesHttp ? NormalizeHttpPath(i.MonitorHttpPath) : null;
        }

        d.ManualUpstreamDeviceId = manualUp;
        d.LocationId = i.LocationId;
        d.Location = locationText;
        d.RackId = i.RackId;
        d.RackUPosition = i.RackId is null ? null : i.RackUPosition;
        d.RackUSize = i.RackId is null ? null : i.RackUSize;
        d.Manufacturer = TrimOrNull(i.Manufacturer);
        d.Model = TrimOrNull(i.Model);
        d.OperatingSystem = TrimOrNull(i.OperatingSystem);
        d.Source = TrimOrNull(i.Source);
        d.UsedNew = TrimOrNull(i.UsedNew);
        d.SourceDate = sourceDate;
        var accessLink = TrimOrNull(i.AccessLink);
        if (accessLink is not null && !DisplayFormat.TryBuildAccessLink(accessLink, out _))
            return Invalid("accessLink", "Access link must be an http(s) URL or a host name (e.g. 192.168.1.10:8080).");
        d.AccessLink = accessLink;
        d.AccessCategoryId = i.AccessCategoryId;
        d.Description = TrimOrNull(i.Description);

        d.SubnetId = await ResolveSubnetIdForIpAsync(db, d.IpAddress, ct);
        return null;
    }

    private static string NormalizeHttpPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "/";
        var t = path.Trim();
        return t.StartsWith('/') ? t : "/" + t;
    }

    private static bool TryParseMonthYear(string value, out DateOnly date)
    {
        date = default;
        var normalized = value.Replace(' ', '-');
        if (DateTime.TryParseExact(normalized, "MMM-yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
        {
            date = new DateOnly(dt.Year, dt.Month, 1);
            return true;
        }
        return false;
    }

    private static async Task<int?> ResolveSubnetIdForIpAsync(AppDbContext db, string? ip, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ip)) return null;
        if (!IpCidr.TryParseIPv4(ip.Trim(), out var ipUInt, out _)) return null;

        var subnets = await db.Subnets.AsNoTracking().Select(s => new { s.Id, s.Cidr }).ToListAsync(ct);
        foreach (var s in subnets)
        {
            if (string.IsNullOrWhiteSpace(s.Cidr)) continue;
            if (!IpCidr.TryParseIPv4Cidr(s.Cidr, out var info, out _)) continue;
            if (ipUInt >= info.NetworkUInt && ipUInt <= info.BroadcastUInt) return s.Id;
        }
        return null;
    }
}
