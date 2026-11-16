using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Services;
using Netipam.Unifi;

namespace Netipam.Api;

/// <summary>Offline, discovery and firmware alerts, plus the offline-clients list.</summary>
public sealed class AlertsApi : IApiModule
{
    public sealed record AddDiscoveryRequest(string? Name, string? Hostname, string? UpstreamDeviceName, string? UpstreamConnection);

    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);
    private static DateTime? Utc(DateTime? d) => d is null ? null : DateTime.SpecifyKind(d.Value, DateTimeKind.Utc);

    public void Map(RouteGroupBuilder api)
    {
        // ---------------- Offline alerts ----------------
        api.MapGet("/alerts/offline", async (bool? ack, AppDbContext db, CancellationToken ct) =>
        {
            var acked = ack ?? false;
            var rows = await db.ClientOfflineAlerts.AsNoTracking()
                .Where(a => a.IsAcknowledged == acked)
                .OrderByDescending(a => a.WentOfflineAtUtc)
                .Take(1000)
                .Select(a => new
                {
                    a.Id,
                    a.DeviceId,
                    deviceName = a.Device != null ? a.Device.Name : a.NameAtTime,
                    hostname = a.Device != null ? a.Device.Hostname : null,
                    ip = a.IpAtTime ?? (a.Device != null ? a.Device.IpAddress : null),
                    mac = a.Device != null ? a.Device.MacAddress : null,
                    a.WentOfflineAtUtc,
                    a.CameOnlineAtUtc,
                    a.IsAcknowledged,
                    a.AcknowledgedAtUtc,
                    ignoreOffline = a.Device != null && a.Device.IgnoreOffline,
                    deviceExists = a.Device != null,
                    a.Source
                })
                .ToListAsync(ct);

            return Results.Ok(rows.Select(a => new
            {
                a.Id, a.DeviceId, a.deviceName, a.hostname, a.ip, a.mac,
                wentOfflineAtUtc = Utc(a.WentOfflineAtUtc),
                cameOnlineAtUtc = Utc(a.CameOnlineAtUtc),
                a.IsAcknowledged,
                acknowledgedAtUtc = Utc(a.AcknowledgedAtUtc),
                a.ignoreOffline, a.deviceExists, a.Source
            }));
        });

        api.MapPost("/alerts/offline/{id:int}/ack", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.ClientOfflineAlerts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Alert not found." });
            e.IsAcknowledged = true;
            e.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        api.MapPost("/alerts/offline/{id:int}/ignore", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.ClientOfflineAlerts.Include(a => a.Device).FirstOrDefaultAsync(a => a.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Alert not found." });
            if (e.Device is not null) e.Device.IgnoreOffline = true;
            e.IsAcknowledged = true;
            e.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        api.MapPost("/alerts/offline/ack-all", async (AppDbContext db, CancellationToken ct) =>
        {
            var now = DateTime.UtcNow;
            var list = await db.ClientOfflineAlerts.Where(a => !a.IsAcknowledged).ToListAsync(ct);
            foreach (var a in list) { a.IsAcknowledged = true; a.AcknowledgedAtUtc = now; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true, count = list.Count });
        }).RequireAuthorization("CanEdit");

        // ---------------- Discovery alerts ----------------
        api.MapGet("/alerts/discovery", async (bool? ack, AppDbContext db, CancellationToken ct) =>
        {
            var acked = ack ?? false;
            var ignored = new HashSet<string>(
                await db.IgnoredDiscoveryMacs.AsNoTracking().Select(i => i.Mac).ToListAsync(ct),
                StringComparer.OrdinalIgnoreCase);

            var rows = await db.ClientDiscoveryAlerts.AsNoTracking()
                .Where(a => a.IsAcknowledged == acked)
                .OrderByDescending(a => a.DetectedAtUtc)
                .Take(1000)
                .ToListAsync(ct);

            return Results.Ok(rows
                .Where(a => acked || !ignored.Contains(a.Mac))
                .Select(a => new
                {
                    a.Id,
                    deviceId = (int?)null,
                    deviceName = a.Name ?? a.Mac,
                    a.Name, a.Hostname,
                    ip = a.IpAddress,
                    mac = a.Mac,
                    a.ConnectionType, a.ConnectionDetail,
                    a.UpstreamDeviceName, a.UpstreamDeviceMac, a.UpstreamConnection,
                    a.IsOnline,
                    detectedAtUtc = Utc(a.DetectedAtUtc),
                    a.IsAcknowledged,
                    acknowledgedAtUtc = Utc(a.AcknowledgedAtUtc),
                    a.Source
                }));
        });

        api.MapPost("/alerts/discovery/{id:int}/ack", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.ClientDiscoveryAlerts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Alert not found." });
            e.IsAcknowledged = true;
            e.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        api.MapPost("/alerts/discovery/{id:int}/ignore", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var alert = await db.ClientDiscoveryAlerts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (alert is null) return Results.NotFound(new { error = "Alert not found." });

            var mac = UnifiParsers.NormalizeMac(alert.Mac ?? "");
            if (!string.IsNullOrWhiteSpace(mac) && !await db.IgnoredDiscoveryMacs.AnyAsync(i => i.Mac == mac, ct))
            {
                db.IgnoredDiscoveryMacs.Add(new IgnoredDiscoveryMac { Mac = mac, IgnoredAtUtc = DateTime.UtcNow, Source = "Dashboard" });
            }
            alert.IsAcknowledged = true;
            alert.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        // Adopt the discovered client as a Device row (optionally with edited fields), then acknowledge.
        api.MapPost("/alerts/discovery/{id:int}/add", async (int id, AddDiscoveryRequest? req, AppDbContext db, CancellationToken ct) =>
        {
            var alert = await db.ClientDiscoveryAlerts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (alert is null) return Results.NotFound(new { error = "Alert not found." });

            var mac = UnifiParsers.NormalizeMac(alert.Mac ?? "");
            if (string.IsNullOrWhiteSpace(mac))
                return Results.BadRequest(new { error = "This alert has no MAC address." });

            static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
            var edited = req is not null;

            var device = new Device
            {
                Name = (edited ? Clean(req!.Name) : null) ?? alert.Name ?? mac,
                Hostname = edited ? Clean(req!.Hostname) : alert.Hostname,
                MacAddress = mac,
                IpAddress = alert.IpAddress,
                ConnectionType = alert.ConnectionType,
                ConnectionDetail = alert.ConnectionDetail,
                UpstreamDeviceName = edited ? Clean(req!.UpstreamDeviceName) : alert.UpstreamDeviceName,
                UpstreamDeviceMac = string.IsNullOrWhiteSpace(alert.UpstreamDeviceMac) ? null : UnifiParsers.NormalizeMac(alert.UpstreamDeviceMac),
                UpstreamConnection = edited ? Clean(req!.UpstreamConnection) : alert.UpstreamConnection,
                IsOnline = alert.IsOnline
            };
            device.SubnetId = await SubnetResolver.ResolveSubnetIdForIpAsync(db, device.IpAddress);

            var exists = await db.Devices.AnyAsync(d => d.MacAddress == device.MacAddress, ct);
            if (!exists) db.Devices.Add(device);

            alert.IsAcknowledged = true;
            alert.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true, created = !exists });
        }).RequireAuthorization("CanEdit");

        api.MapPost("/alerts/discovery/ack-all", async (AppDbContext db, CancellationToken ct) =>
        {
            var now = DateTime.UtcNow;
            var list = await db.ClientDiscoveryAlerts.Where(a => !a.IsAcknowledged).ToListAsync(ct);
            foreach (var a in list) { a.IsAcknowledged = true; a.AcknowledgedAtUtc = now; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true, count = list.Count });
        }).RequireAuthorization("CanEdit");

        // ---------------- Firmware alerts ----------------
        api.MapGet("/alerts/firmware", async (bool? ack, AppDbContext db, CancellationToken ct) =>
        {
            var acked = ack ?? false;
            var rows = await db.DeviceFirmwareUpdateAlerts.AsNoTracking()
                .Where(a => a.IsAcknowledged == acked)
                .OrderByDescending(a => a.DetectedAtUtc)
                .Take(1000)
                .Select(a => new
                {
                    a.Id,
                    a.DeviceId,
                    deviceName = a.Device != null ? a.Device.Name : a.NameAtTime,
                    ip = a.Device != null ? a.Device.IpAddress : null,
                    mac = a.MacAtTime ?? (a.Device != null ? a.Device.MacAddress : null),
                    model = a.ModelAtTime,
                    a.CurrentVersion, a.TargetVersion,
                    a.DetectedAtUtc, a.ResolvedAtUtc, a.IsAcknowledged, a.AcknowledgedAtUtc, a.Source
                })
                .ToListAsync(ct);

            return Results.Ok(rows.Select(a => new
            {
                a.Id, a.DeviceId, a.deviceName, a.ip, a.mac, a.model, a.CurrentVersion, a.TargetVersion,
                detectedAtUtc = Utc(a.DetectedAtUtc),
                resolvedAtUtc = Utc(a.ResolvedAtUtc),
                a.IsAcknowledged,
                acknowledgedAtUtc = Utc(a.AcknowledgedAtUtc),
                a.Source
            }));
        });

        api.MapPost("/alerts/firmware/{id:int}/ack", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.DeviceFirmwareUpdateAlerts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Alert not found." });
            e.IsAcknowledged = true;
            e.AcknowledgedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        api.MapPost("/alerts/firmware/ack-all", async (AppDbContext db, CancellationToken ct) =>
        {
            var now = DateTime.UtcNow;
            var list = await db.DeviceFirmwareUpdateAlerts.Where(a => !a.IsAcknowledged).ToListAsync(ct);
            foreach (var a in list) { a.IsAcknowledged = true; a.AcknowledgedAtUtc = now; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true, count = list.Count });
        }).RequireAuthorization("CanEdit");

        // ---------------- Offline clients (status-tracked devices currently down) ----------------
        api.MapGet("/alerts/offline-clients", async (int? subnetId, AppDbContext db, AppSettingsService settings, CancellationToken ct) =>
        {
            string? subnetName = null;
            if (subnetId is not null)
            {
                subnetName = await db.Subnets.AsNoTracking().Where(s => s.Id == subnetId).Select(s => s.Name).FirstOrDefaultAsync(ct);
                if (subnetName is null) return Results.NotFound(new { error = "Subnet not found." });
            }

            var q = db.Devices.AsNoTracking().Where(d => d.IsStatusTracked && !d.IsOnline);
            if (subnetId is not null) q = q.Where(d => d.SubnetId == subnetId);

            var rows = await q.OrderBy(d => d.Name).Select(d => new
            {
                d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress,
                type = d.ClientType != null ? d.ClientType.Name : null,
                isDevice = d.ClientType != null && d.ClientType.IsDevice,
                subnetId = d.SubnetId,
                subnet = d.Subnet != null ? d.Subnet.Name : null,
                location = d.LocationRef != null ? d.LocationRef.Name : d.Location,
                d.ConnectionType, d.ConnectionDetail,
                d.LastOnlineAt, d.IgnoreOffline
            }).ToListAsync(ct);

            var s = await settings.LoadAsync(ct);
            return Results.Ok(new
            {
                subnetName,
                showLastSeenTooltips = s.ShowLastSeenTooltips,
                autoRefreshSeconds = s.UiAutoRefreshSeconds,
                items = rows.Select(d => new
                {
                    d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress, d.type, d.isDevice,
                    d.subnetId, d.subnet, d.location, d.ConnectionType, d.ConnectionDetail,
                    lastOnlineAt = Utc(d.LastOnlineAt), d.IgnoreOffline
                })
            });
        });

        api.MapDelete("/alerts/offline-clients/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var d = await db.Devices.FindAsync(new object[] { id }, ct);
            if (d is null) return Results.NotFound(new { error = "Entry not found." });
            db.Devices.Remove(d);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");
    }
}
