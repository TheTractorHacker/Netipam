using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Api;

public sealed class DashboardApi : IApiModule
{
    public void Map(RouteGroupBuilder api)
    {
        api.MapGet("/summary", async (AppDbContext db, CancellationToken ct) =>
        {
            var rows = await db.Devices.AsNoTracking()
                .Select(d => new
                {
                    d.SubnetId,
                    d.IsOnline,
                    d.IsStatusTracked,
                    d.IgnoreOffline,
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
                    s.Id, s.Name, s.Cidr, s.VlanId,
                    usable,
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
    }
}
