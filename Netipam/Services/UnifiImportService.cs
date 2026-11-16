using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Unifi;

namespace Netipam.Services;

// ---------------------------------------------------------------------------
// DTOs shared by the import API and the React UI. Kind is "new" | "changed" | "unchanged".
// ---------------------------------------------------------------------------
public sealed record SubnetImportRow(
    bool Selected, string Kind, string? Name, string Cidr, string? Description,
    string? DhcpStart, string? DhcpEnd, int? VlanId, string? Dns1, string? Dns2);

public sealed record ClientImportRow(
    bool Selected, string Kind, string Mac, string? Name, string? Hostname, string? IpAddress,
    string? Manufacturer, bool IsOnline, string? ConnectionType, string? ConnectionDetail,
    string? UpstreamDeviceName, string? UpstreamDeviceMac, string? UpstreamConnection);

public sealed record InfraImportRow(
    bool Selected, string Kind, string Mac, string? Name, string? IpAddress, string? Model,
    string? UnifiType, string? MappedTypeName, int? MappedTypeId, bool IsOnline,
    string? ConnectionDetail, string? UpstreamDeviceName, string? UpstreamDeviceMac, string? UpstreamConnection);

public sealed record UpdateFieldRow(string Key, string Label, string? Current, string? Incoming, bool Changed);

/// <param name="Apply">Field keys the user chose to apply (commit only).</param>
public sealed record ClientUpdateImportRow(
    string Kind, string Mac, bool IsOnline,
    string? ConnectionType, string? ConnectionDetail,
    string? UpstreamDeviceName, string? UpstreamDeviceMac, string? UpstreamConnection,
    List<UpdateFieldRow> Fields, List<string>? Apply);

public sealed record PreviewResult<T>(List<T> Rows, string Message, int WaitedSeconds, int FilteredStale = 0);

public sealed record CommitResult(int Created, int Updated, int FieldsApplied, string Message);

/// <summary>
/// UniFi import logic extracted from UnifiImport.razor. Stateless: previews return rows, commits take rows back.
/// Construct per request with scoped dependencies.
/// </summary>
public sealed class UnifiImportService
{
    private readonly AppDbContext _db;
    private readonly AppSettingsService _settings;
    private readonly UnifiApiClient _unifi;
    private readonly UnifiUpdaterControl _control;

    public UnifiImportService(AppDbContext db, AppSettingsService settings, UnifiApiClient unifi, UnifiUpdaterControl control)
    {
        _db = db; _settings = settings; _unifi = unifi; _control = control;
    }

    private static readonly string[] InfraTypeNames =
    {
        "Wireless AP", "Network Switch", "Gateway / Router", "Security Camera", "NVR", "UniFi Controller", "Other UniFi Device"
    };

    // -----------------------------------------------------------------
    // UniFi access (serialised + staggered by UnifiUpdaterControl)
    // -----------------------------------------------------------------
    private async Task<int> RunUnifiAsync(Func<CancellationToken, Task> action, CancellationToken ct)
    {
        var waited = 0;
        void OnDelay(TimeSpan w) => waited = Math.Max(waited, (int)Math.Ceiling(w.TotalSeconds));
        _control.DelayStarted += OnDelay;
        try { await _control.RunAsync(action, ct); }
        finally { _control.DelayStarted -= OnDelay; }
        return waited;
    }

    public async Task TestConnectAsync(CancellationToken ct)
        => await _control.RunAsync(async c => await _unifi.LoginAsync(ct: c), ct);

    // -----------------------------------------------------------------
    // Subnets
    // -----------------------------------------------------------------
    public async Task<PreviewResult<SubnetImportRow>> PreviewSubnetsAsync(CancellationToken ct)
    {
        JsonDocument doc = null!;
        var waited = await RunUnifiAsync(async c => { doc = await _unifi.GetNetworksAsync(c); }, ct);
        var incoming = UnifiParsers.ParseNetworks(doc);

        var existing = await _db.Subnets.AsNoTracking().ToListAsync(ct);
        var byCidr = new Dictionary<string, Subnet>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in existing.Where(s => !string.IsNullOrWhiteSpace(s.Cidr)))
            byCidr.TryAdd(s.Cidr.Trim(), s);

        var rows = new List<SubnetImportRow>();
        foreach (var s in incoming)
        {
            if (string.IsNullOrWhiteSpace(s.Cidr)) continue;
            byCidr.TryGetValue(s.Cidr.Trim(), out var db);
            var desc = string.IsNullOrWhiteSpace(s.Purpose) ? null : s.Purpose!.Trim();

            var kind =
                db is null ? "new" :
                (Changed(db.Name, s.Name) || Changed(db.Cidr, s.Cidr) || Changed(db.Description, desc) ||
                 Changed(db.DhcpRangeStart, s.DhcpStart) || Changed(db.DhcpRangeEnd, s.DhcpEnd) ||
                 Changed(db.Dns1, s.Dns1) || Changed(db.Dns2, s.Dns2) || db.VlanId != s.VlanId) ? "changed" : "unchanged";

            rows.Add(new SubnetImportRow(kind != "unchanged", kind, s.Name?.Trim(), s.Cidr.Trim(), desc,
                s.DhcpStart?.Trim(), s.DhcpEnd?.Trim(), s.VlanId, s.Dns1?.Trim(), s.Dns2?.Trim()));
        }
        return new PreviewResult<SubnetImportRow>(rows, $"Loaded {rows.Count} subnets.", waited);
    }

    public async Task<CommitResult> CommitSubnetsAsync(IEnumerable<SubnetImportRow> selected, CancellationToken ct)
    {
        var list = selected.Where(r => !string.IsNullOrWhiteSpace(r.Cidr)).ToList();
        if (list.Count == 0) return new CommitResult(0, 0, 0, "None selected.");

        var all = await _db.Subnets.ToListAsync(ct);
        var byCidr = new Dictionary<string, Subnet>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in all.Where(s => !string.IsNullOrWhiteSpace(s.Cidr)))
            byCidr.TryAdd(s.Cidr.Trim(), s);

        int created = 0, updated = 0;
        foreach (var r in list)
        {
            var cidr = r.Cidr.Trim();
            if (cidr.Length > 64 || !IpCidr.TryParseIPv4Cidr(cidr, out _, out _))
                throw new InvalidOperationException($"Invalid CIDR '{Cap(cidr, 64)}'.");
            if (!byCidr.TryGetValue(cidr, out var entity))
            {
                entity = new Subnet();
                _db.Subnets.Add(entity);
                byCidr[cidr] = entity;
                created++;
            }
            else updated++;

            entity.Name = Cap(r.Name, MaxText) ?? "";
            entity.Cidr = cidr;
            entity.Description = Cap(r.Description, 500);
            entity.DhcpRangeStart = Cap(r.DhcpStart, 64);
            entity.DhcpRangeEnd = Cap(r.DhcpEnd, 64);
            entity.VlanId = r.VlanId is >= 0 and <= 4094 ? r.VlanId : null;
            entity.Dns1 = Cap(r.Dns1, 64);
            entity.Dns2 = Cap(r.Dns2, 64);
        }

        await _db.SaveChangesAsync(ct);
        return new CommitResult(created, updated, 0, $"Commit complete. Created: {created}, Updated: {updated}.");
    }

    // -----------------------------------------------------------------
    // Clients
    // -----------------------------------------------------------------
    public async Task<PreviewResult<ClientImportRow>> PreviewClientsAsync(CancellationToken ct)
    {
        var (incoming, filtered, cutoff, waited) = await FetchMergedClientsAsync(ct);

        var existing = await _db.Devices.AsNoTracking().ToListAsync(ct);
        var byMac = MapByMac(existing);

        var rows = new List<ClientImportRow>();
        foreach (var c in incoming)
        {
            if (string.IsNullOrWhiteSpace(c.Mac)) continue;
            var mac = UnifiParsers.NormalizeMac(c.Mac);
            byMac.TryGetValue(mac, out var db);

            // "Changed" ignores Manufacturer/Model/OS (curated fields)
            var kind =
                db is null ? "new" :
                (Changed(db.Name, c.Name) || Changed(db.Hostname, c.Hostname) || Changed(db.IpAddress, c.IpAddress) ||
                 Changed(db.ConnectionType, c.ConnectionType) || Changed(db.ConnectionDetail, c.ConnectionDetail)) ? "changed" : "unchanged";

            var selected = kind switch { "new" => c.IsOnline, "changed" => true, _ => false };

            rows.Add(new ClientImportRow(selected, kind, mac, c.Name?.Trim(), c.Hostname?.Trim(), c.IpAddress?.Trim(),
                c.Manufacturer?.Trim(), c.IsOnline, c.ConnectionType?.Trim(), c.ConnectionDetail?.Trim(),
                c.UpstreamDeviceName?.Trim(), c.UpstreamDeviceMac?.Trim(), c.UpstreamConnection?.Trim()));
        }

        var msg = cutoff > 0
            ? $"Loaded {rows.Count} clients. Filtered out {filtered} stale known clients (> {cutoff} days)."
            : $"Loaded {rows.Count} clients.";
        return new PreviewResult<ClientImportRow>(rows, msg, waited, filtered);
    }

    public async Task<CommitResult> CommitClientsAsync(IEnumerable<ClientImportRow> selected, CancellationToken ct)
    {
        var list = selected.Where(r => !string.IsNullOrWhiteSpace(r.Mac)).ToList();
        if (list.Count == 0) return new CommitResult(0, 0, 0, "None selected.");

        var ctx = await LoadTrackedAsync(ct);
        int created = 0, updated = 0;

        foreach (var r in list)
        {
            var macKey = RequireMac(r.Mac);
            if (!ctx.ByMac.TryGetValue(macKey, out var entity))
            {
                entity = new Device { IsStatusTracked = true };
                _db.Devices.Add(entity);
                created++;
            }
            else updated++;

            entity.MacAddress = macKey;
            entity.Name =
                !string.IsNullOrWhiteSpace(r.Name) ? Cap(r.Name, MaxText)! :
                !string.IsNullOrWhiteSpace(r.Hostname) ? Cap(r.Hostname, MaxText)! : macKey;
            entity.Hostname = Cap(r.Hostname, MaxText);
            entity.IpAddress = CleanIp(r.IpAddress);
            entity.IsOnline = r.IsOnline;
            if (r.IsOnline) { entity.LastSeenAt = DateTime.UtcNow; entity.LastOnlineAt = DateTime.UtcNow; }
            entity.Manufacturer = Cap(r.Manufacturer, MaxText);

            ApplyConnection(entity, r.ConnectionType, r.ConnectionDetail, r.UpstreamDeviceName, r.UpstreamDeviceMac, r.UpstreamConnection);
            SetParent(entity, ctx);
            entity.SubnetId = await SubnetResolver.ResolveSubnetIdForIpAsync(_db, entity.IpAddress);

            ctx.ByMac[macKey] = entity;
            UpsertName(ctx.ByName, entity);
        }

        await _db.SaveChangesAsync(ct);
        return new CommitResult(created, updated, 0, $"Commit complete. Created: {created}, Updated: {updated}.");
    }

    // -----------------------------------------------------------------
    // Infrastructure devices
    // -----------------------------------------------------------------
    public static string MapUnifiTypeToDeviceTypeName(string? unifiType)
    {
        var t = (unifiType ?? "").Trim().ToLowerInvariant();
        if (t.StartsWith("uap")) return "Wireless AP";
        if (t.StartsWith("usw")) return "Network Switch";
        if (t.StartsWith("ugw") || t.StartsWith("udm") || t.StartsWith("uxg")) return "Gateway / Router";
        if (t.StartsWith("uvc")) return "Security Camera";
        if (t.StartsWith("unvr")) return "NVR";
        if (t.StartsWith("uck")) return "UniFi Controller";
        return "Other UniFi Device";
    }

    private async Task<Dictionary<string, int>> EnsureInfraDeviceTypesAsync(CancellationToken ct)
    {
        var existing = await _db.ClientTypes.ToListAsync(ct);
        var byName = new Dictionary<string, ClientType>(StringComparer.OrdinalIgnoreCase);
        foreach (var x in existing) byName.TryAdd(x.Name.Trim(), x);

        var changed = false;
        foreach (var name in InfraTypeNames)
        {
            if (!byName.TryGetValue(name, out var row))
            {
                row = new ClientType { Name = name, IsDevice = true, IsHost = false };
                _db.ClientTypes.Add(row);
                byName[name] = row;
                changed = true;
            }
            else if (!row.IsDevice) { row.IsDevice = true; changed = true; }
        }
        if (changed) await _db.SaveChangesAsync(ct);

        var refreshed = await _db.ClientTypes.AsNoTracking().ToListAsync(ct);
        var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var x in refreshed.Where(x => InfraTypeNames.Contains(x.Name, StringComparer.OrdinalIgnoreCase)))
            result.TryAdd(x.Name.Trim(), x.Id);
        return result;
    }

    public async Task<PreviewResult<InfraImportRow>> PreviewInfraAsync(CancellationToken ct)
    {
        var typeIdByName = await EnsureInfraDeviceTypesAsync(ct);

        JsonDocument doc = null!;
        var waited = await RunUnifiAsync(async c => { doc = await _unifi.GetDevicesAsync(c); }, ct);

        var nameMap = UnifiParsers.BuildDeviceNameMap(doc);
        var incoming = UnifiParsers.ParseInfraDevices(doc);

        var existing = await _db.Devices.AsNoTracking().ToListAsync(ct);
        var byMac = MapByMac(existing);

        var rows = new List<InfraImportRow>();
        foreach (var u in incoming)
        {
            var mac = UnifiParsers.NormalizeMac(u.Mac);
            byMac.TryGetValue(mac, out var db);

            var mappedName = MapUnifiTypeToDeviceTypeName(u.Type);
            int? mappedId = typeIdByName.TryGetValue(mappedName, out var id) ? id : null;
            var up = BuildInfraUplink(u, nameMap);

            var kind =
                db is null ? "new" :
                (Changed(db.Name, u.Name) || Changed(db.IpAddress, u.IpAddress) || Changed(db.Model, u.Model) ||
                 db.ClientTypeId != mappedId) ? "changed" : "unchanged";

            rows.Add(new InfraImportRow(kind != "unchanged", kind, mac, u.Name?.Trim(), u.IpAddress?.Trim(), u.Model?.Trim(),
                u.Type?.Trim(), mappedName, mappedId, u.IsOnline, up.Detail, up.ParentName, up.ParentMac, up.Connection));
        }
        return new PreviewResult<InfraImportRow>(rows, $"Loaded {rows.Count} UniFi devices.", waited);
    }

    private static (string? ParentName, string? ParentMac, string? Connection, string? Detail) BuildInfraUplink(
        UnifiParsers.UnifiInfraDevice u, IReadOnlyDictionary<string, string> nameMap)
    {
        if (string.IsNullOrWhiteSpace(u.UplinkMac) && u.UplinkPort is null)
            return (null, null, null, null);

        string? parentName = null, parentMac = null;
        if (!string.IsNullOrWhiteSpace(u.UplinkMac))
        {
            parentMac = UnifiParsers.NormalizeMac(u.UplinkMac);
            parentName = nameMap.TryGetValue(parentMac, out var mapped) ? mapped : u.UplinkMac;
        }

        var conn = u.UplinkPort is not null ? $"port {u.UplinkPort.Value}" : null;
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(parentName)) parts.Add(parentName!);
        if (!string.IsNullOrWhiteSpace(conn)) parts.Add(conn!);
        return (parentName, parentMac, conn, parts.Count == 0 ? null : string.Join(" | ", parts));
    }

    public async Task<CommitResult> CommitInfraAsync(IEnumerable<InfraImportRow> selected, CancellationToken ct)
    {
        var list = selected.Where(r => !string.IsNullOrWhiteSpace(r.Mac)).ToList();
        if (list.Count == 0) return new CommitResult(0, 0, 0, "None selected.");

        var ctx = await LoadTrackedAsync(ct);
        var validTypeIds = (await EnsureInfraDeviceTypesAsync(ct)).Values.ToHashSet();
        int created = 0, updated = 0;

        foreach (var r in list)
        {
            var macKey = RequireMac(r.Mac);
            if (!ctx.ByMac.TryGetValue(macKey, out var entity))
            {
                entity = new Device { IsStatusTracked = true };
                _db.Devices.Add(entity);
                created++;
            }
            else updated++;

            entity.MacAddress = macKey;
            if (r.MappedTypeId is not null && !validTypeIds.Contains(r.MappedTypeId.Value))
                throw new InvalidOperationException($"Invalid device type id {r.MappedTypeId} for {macKey}.");
            if (r.MappedTypeId is not null) entity.ClientTypeId = r.MappedTypeId;

            entity.Name = !string.IsNullOrWhiteSpace(r.Name) ? Cap(r.Name, MaxText)! : macKey;
            entity.IpAddress = CleanIp(r.IpAddress);
            entity.IsOnline = r.IsOnline;
            if (r.IsOnline) { entity.LastSeenAt = DateTime.UtcNow; entity.LastOnlineAt = DateTime.UtcNow; }

            entity.Manufacturer ??= "Ubiquiti";
            entity.Model = Cap(r.Model, MaxText);

            ApplyConnection(entity, "Wired", r.ConnectionDetail, r.UpstreamDeviceName, r.UpstreamDeviceMac, r.UpstreamConnection);
            SetParent(entity, ctx);
            EnsureHostUpstream(entity, ctx);
            entity.SubnetId = await SubnetResolver.ResolveSubnetIdForIpAsync(_db, entity.IpAddress);

            ctx.ByMac[macKey] = entity;
            UpsertName(ctx.ByName, entity);
        }

        await _db.SaveChangesAsync(ct);
        return new CommitResult(created, updated, 0, $"Commit complete. Created: {created}, Updated: {updated}.");
    }

    // -----------------------------------------------------------------
    // Client update (field level)
    // -----------------------------------------------------------------
    public async Task<PreviewResult<ClientUpdateImportRow>> PreviewClientUpdatesAsync(CancellationToken ct)
    {
        var (incoming, _, _, waited) = await FetchMergedClientsAsync(ct);

        var existing = await _db.Devices.AsNoTracking().ToListAsync(ct);
        var byMac = MapByMac(existing);

        var rows = new List<ClientUpdateImportRow>();
        foreach (var u in incoming)
        {
            if (string.IsNullOrWhiteSpace(u.Mac)) continue;
            var mac = UnifiParsers.NormalizeMac(u.Mac);
            byMac.TryGetValue(mac, out var db);

            var fields = new List<UpdateFieldRow>
            {
                Field("name", "Name", db?.Name, u.Name),
                Field("hostname", "Hostname", db?.Hostname, u.Hostname),
                Field("ipAddress", "IP Address", db?.IpAddress, u.IpAddress),
            };
            var kind = db is null ? "new" : fields.Any(f => f.Changed) ? "changed" : "unchanged";
            var apply = kind == "unchanged" ? new List<string>() : fields.Where(f => f.Changed).Select(f => f.Key).ToList();

            rows.Add(new ClientUpdateImportRow(kind, mac, u.IsOnline,
                u.ConnectionType?.Trim(), u.ConnectionDetail?.Trim(),
                u.UpstreamDeviceName?.Trim(), u.UpstreamDeviceMac?.Trim(), u.UpstreamConnection?.Trim(),
                fields, apply));
        }

        var msg = $"Loaded {rows.Count} UniFi clients. New: {rows.Count(r => r.Kind == "new")}, " +
                  $"Changed: {rows.Count(r => r.Kind == "changed")}, Unchanged: {rows.Count(r => r.Kind == "unchanged")}.";
        return new PreviewResult<ClientUpdateImportRow>(rows, msg, waited);
    }

    private const int MaxText = 200;

    /// <summary>Trim and cap length; empty becomes null.</summary>
    private static string? Cap(string? v, int max)
    {
        var t = v is null ? null : new string(v.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        if (string.IsNullOrEmpty(t)) return null;
        return t.Length > max ? t[..max] : t;
    }

    private static UpdateFieldRow Field(string key, string label, string? current, string? incoming)
        => new(key, label, current, incoming, Changed(current, incoming));

    public async Task<CommitResult> CommitClientUpdatesAsync(IEnumerable<ClientUpdateImportRow> rowsIn, CancellationToken ct)
    {
        var rows = rowsIn.Where(r => r.Kind != "unchanged" && !string.IsNullOrWhiteSpace(r.Mac)).ToList();
        if (rows.Count == 0) return new CommitResult(0, 0, 0, "Nothing to apply.");

        var ctx = await LoadTrackedAsync(ct);
        int created = 0, updated = 0, fieldsApplied = 0;

        foreach (var r in rows)
        {
            var mac = RequireMac(r.Mac);
            var applyKeys = new HashSet<string>(r.Apply ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
            var applyFields = (r.Fields ?? new List<UpdateFieldRow>()).Where(f => f.Changed && applyKeys.Contains(f.Key)).ToList();

            var isNew = !ctx.ByMac.TryGetValue(mac, out var entity);
            if (isNew)
                entity = new Device { MacAddress = mac, IsStatusTracked = true };

            entity!.IsOnline = r.IsOnline;
            if (r.IsOnline) { entity.LastSeenAt = DateTime.UtcNow; entity.LastOnlineAt = DateTime.UtcNow; }

            ApplyFields(entity, applyFields);

            if (string.IsNullOrWhiteSpace(entity.Name))
                entity.Name = FallbackName(entity);

            if (r.IsOnline)
                ApplyConnection(entity, r.ConnectionType, r.ConnectionDetail, r.UpstreamDeviceName, r.UpstreamDeviceMac, r.UpstreamConnection);

            SetParent(entity, ctx);
            EnsureHostUpstream(entity, ctx);

            if (isNew)
            {
                entity.SubnetId = await SubnetResolver.ResolveSubnetIdForIpAsync(_db, entity.IpAddress);
                _db.Devices.Add(entity);
                created++;
            }
            else
            {
                if (applyFields.Any(f => f.Key == "ipAddress"))
                    entity.SubnetId = await SubnetResolver.ResolveSubnetIdForIpAsync(_db, entity.IpAddress);
                updated++;
            }
            fieldsApplied += applyFields.Count;

            ctx.ByMac[mac] = entity;
            UpsertName(ctx.ByName, entity);
        }

        await _db.SaveChangesAsync(ct);
        return new CommitResult(created, updated, fieldsApplied,
            $"Commit complete. Created: {created}, Updated: {updated}, Fields applied: {fieldsApplied}.");
    }

    private static void ApplyFields(Device entity, List<UpdateFieldRow> fields)
    {
        foreach (var f in fields)
        {
            switch (f.Key)
            {
                case "name":
                    entity.Name =
                        !string.IsNullOrWhiteSpace(f.Incoming) ? Cap(f.Incoming, MaxText)! : FallbackName(entity);
                    break;
                case "hostname": entity.Hostname = Cap(f.Incoming, MaxText); break;
                case "ipAddress": entity.IpAddress = CleanIp(f.Incoming); break;
            }
        }
    }

    private static string FallbackName(Device e) =>
        !string.IsNullOrWhiteSpace(e.Hostname) ? e.Hostname! :
        !string.IsNullOrWhiteSpace(e.MacAddress) ? e.MacAddress! : "Unknown";

    // -----------------------------------------------------------------
    // Shared helpers
    // -----------------------------------------------------------------
    private async Task<(List<UnifiParsers.UnifiClient> Clients, int Filtered, int CutoffDays, int Waited)> FetchMergedClientsAsync(
        CancellationToken ct)
    {

        JsonDocument active = null!, known = null!, devices = null!;
        var waited = await RunUnifiAsync(async c =>
        {
            active = await _unifi.GetActiveClientsAsync(c);
            known = await _unifi.GetKnownClientsAsync(c);
            devices = await _unifi.GetDevicesAsync(c);
        }, ct);

        var nameMap = UnifiParsers.BuildDeviceNameMap(devices);
        var merged = UnifiParsers.MergeClients(active, known, nameMap);
        var settings = await _settings.LoadAsync(ct);
        var cutoff = settings.UnifiKnownClientCutoffDays;
        merged = ApplyKnownClientCutoff(merged, cutoff, out var filtered);
        return (merged, filtered, cutoff, waited);
    }

    private static List<UnifiParsers.UnifiClient> ApplyKnownClientCutoff(List<UnifiParsers.UnifiClient> clients, int cutoffDays, out int filtered)
    {
        if (cutoffDays <= 0) { filtered = 0; return clients; }
        var cutoffUtc = DateTime.UtcNow.AddDays(-cutoffDays);
        var kept = clients.Where(c => c.IsOnline || c.LastSeenUtc is null || c.LastSeenUtc.Value >= cutoffUtc).ToList();
        filtered = clients.Count - kept.Count;
        return kept;
    }

    private sealed class Tracked
    {
        public Dictionary<string, Device> ByMac = new();
        public Dictionary<string, Device> ByName = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<int, Device> ById = new();
    }

    private async Task<Tracked> LoadTrackedAsync(CancellationToken ct)
    {
        var devices = await _db.Devices.ToListAsync(ct);
        var t = new Tracked { ByMac = MapByMac(devices), ById = devices.ToDictionary(d => d.Id) };
        foreach (var d in devices)
        {
            if (string.IsNullOrWhiteSpace(d.Name)) continue;
            t.ByName.TryAdd(d.Name.Trim(), d);
        }
        return t;
    }

    private static Dictionary<string, Device> MapByMac(IEnumerable<Device> devices)
    {
        var map = new Dictionary<string, Device>();
        foreach (var d in devices.Where(d => !string.IsNullOrWhiteSpace(d.MacAddress)))
            map.TryAdd(UnifiParsers.NormalizeMac(d.MacAddress!), d);
        return map;
    }

    private static bool Changed(string? a, string? b)
        => !string.Equals((a ?? "").Trim(), (b ?? "").Trim(), StringComparison.OrdinalIgnoreCase);

    private static string? TrimOrNull(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private static readonly System.Text.RegularExpressions.Regex MacRx =
        new("^([0-9a-f]{2}:){5}[0-9a-f]{2}$", System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>Normalise and validate a MAC; throws (surfaced as a 400) when malformed.</summary>
    private static string RequireMac(string? mac)
    {
        var m = UnifiParsers.NormalizeMac(mac ?? "");
        if (!MacRx.IsMatch(m))
            throw new InvalidOperationException($"Invalid MAC address '{Cap(mac, 40)}'.");
        return m;
    }

    /// <summary>Trim, cap and require a parseable IP address; empty becomes null.</summary>
    private static string? CleanIp(string? ip)
    {
        var v = Cap(ip, 64);
        if (v is null) return null;
        if (!System.Net.IPAddress.TryParse(v, out _) || v.Any(char.IsWhiteSpace))
            throw new InvalidOperationException($"Invalid IP address '{v}'.");
        return v;
    }

    private static string? NormalizeMacOrNull(string? mac) =>
        string.IsNullOrWhiteSpace(mac) ? null : UnifiParsers.NormalizeMac(mac);

    private static void ApplyConnection(Device entity, string? type, string? detail, string? upName, string? upMac, string? upConn)
    {
        var t = Cap(type, 32); if (t != null) entity.ConnectionType = t;
        var d = Cap(detail, 255); if (d != null) entity.ConnectionDetail = d;
        var n = Cap(upName, 255); if (n != null) entity.UpstreamDeviceName = n;
        var m = Cap(upMac, 64) is { } um ? RequireMac(um) : null; if (m != null) entity.UpstreamDeviceMac = m;
        var c = Cap(upConn, 255); if (c != null) entity.UpstreamConnection = c;
    }

    private static void UpsertName(IDictionary<string, Device> map, Device entity)
    {
        if (!string.IsNullOrWhiteSpace(entity.Name)) map[entity.Name.Trim()] = entity;
    }

    private static void EnsureHostUpstream(Device entity, Tracked ctx)
    {
        if (entity.HostDeviceId is not int hostId) return;
        if (!ctx.ById.TryGetValue(hostId, out var host)) return;
        entity.ParentDeviceId = host.Id;
        entity.UpstreamDeviceName = host.Name ?? entity.UpstreamDeviceName;
        entity.UpstreamDeviceMac = host.MacAddress ?? entity.UpstreamDeviceMac;
        entity.UpstreamConnection = "Hosted";
    }

    /// <summary>
    /// Resolve the parent (host first, then upstream MAC, then upstream name). Parents that were created in this
    /// same batch have no Id yet, so they are linked through the navigation property instead of the FK.
    /// </summary>
    private static void SetParent(Device entity, Tracked ctx)
    {
        if (entity.HostDeviceId is int hostId)
        {
            entity.UpstreamConnection ??= "Hosted";
            if (hostId != entity.Id) { entity.ParentDeviceId = hostId; return; }
        }

        Device? parent = null;
        if (!string.IsNullOrWhiteSpace(entity.UpstreamDeviceMac))
        {
            var key = UnifiParsers.NormalizeMac(entity.UpstreamDeviceMac);
            if (ctx.ByMac.TryGetValue(key, out var cand) && !ReferenceEquals(cand, entity)) parent = cand;
        }
        if (parent is null && !string.IsNullOrWhiteSpace(entity.UpstreamDeviceName))
        {
            if (ctx.ByName.TryGetValue(entity.UpstreamDeviceName.Trim(), out var cand) && !ReferenceEquals(cand, entity)) parent = cand;
        }

        if (parent is null) { entity.ParentDeviceId = null; entity.ParentDevice = null; }
        else if (parent.Id == 0) entity.ParentDevice = parent;
        else { entity.ParentDeviceId = parent.Id; }
    }
}
