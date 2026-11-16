using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Api;

public sealed class SearchApi : IApiModule
{
    private const int MaxDevices = 200;

    public void Map(RouteGroupBuilder api)
    {
        // GET /api/search?q=...&compact=true
        // compact=true is used by the Ctrl+K palette (few rows per group, no IP/location/rack groups).
        api.MapGet("/search", async (AppDbContext db, string? q, bool? compact, CancellationToken ct) =>
        {
            var term = (q ?? "").Replace("\0", "").Trim().ToLowerInvariant();
            var small = compact == true;

            if (term.Length == 0)
            {
                return Results.Ok(new
                {
                    query = "",
                    devices = Array.Empty<object>(), devicesTruncated = false,
                    subnets = Array.Empty<object>(), ips = Array.Empty<object>(),
                    locations = Array.Empty<object>(), racks = Array.Empty<object>(),
                });
            }

            var devLimit = small ? 8 : MaxDevices;
            var otherLimit = small ? 5 : 50;

            // Case-insensitive matching is done in memory: SQLite's lower() is ASCII-only while
            // PostgreSQL's is Unicode-aware, so SQL-side ToLower() would behave differently per provider.
            bool Has(string? v) => v != null && v.ToLowerInvariant().Contains(term, StringComparison.Ordinal);

            var devRows = await db.Devices.AsNoTracking()
                .Select(d => new
                {
                    d.Id, d.Name, d.Manufacturer, d.Model, d.Hostname,
                    Ip = d.IpAddress, Mac = d.MacAddress,
                    d.OperatingSystem, d.Description, d.Usage, d.AssetNumber, LegacyLocation = d.Location,
                    Type = d.ClientType != null ? d.ClientType.Name : null,
                    IsDevice = d.ClientType != null && d.ClientType.IsDevice,
                    LocationName = d.LocationRef != null ? d.LocationRef.Name : null,
                    Subnet = d.Subnet != null ? d.Subnet.Name : null,
                    Online = d.IsOnline,
                })
                .ToListAsync(ct);

            var foundAll = devRows
                .Where(d =>
                    Has(d.Name) || Has(d.Hostname) || Has(d.Ip) || Has(d.Mac) ||
                    (!small && (Has(d.Manufacturer) || Has(d.Model) || Has(d.OperatingSystem) || Has(d.Description) ||
                                Has(d.Usage) || Has(d.AssetNumber) || Has(d.LegacyLocation) || Has(d.LocationName) ||
                                Has(d.Type) || Has(d.Subnet))))
                .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
                .Take(devLimit + 1)
                .Select(d => new
                {
                    d.Id, d.Name, d.Manufacturer, d.Model, d.Hostname, d.Ip, d.Mac, d.Type, d.IsDevice,
                    Location = d.LocationName ?? d.LegacyLocation,
                    d.Subnet, d.Online,
                })
                .ToList();
            var found = foundAll;

            var devices = found.Take(devLimit).Select(d => new
            {
                d.Id,
                d.Name,
                Detail = string.Join(" · ", new[] { d.Manufacturer, d.Model, d.Hostname }.Where(x => !string.IsNullOrWhiteSpace(x))),
                d.Ip, d.Mac, d.Type, d.Location, d.Subnet, d.Online, d.IsDevice,
            }).ToList();

            var subnets = (await db.Subnets.AsNoTracking()
                    .Select(s => new { s.Id, s.Name, s.Cidr, s.VlanId, s.Description })
                    .ToListAsync(ct))
                .Where(s => Has(s.Name) || Has(s.Cidr) || (!small && Has(s.Description)))
                .OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase).Take(otherLimit)
                .ToList();

            if (small)
            {
                return Results.Ok(new
                {
                    query = term,
                    devices, devicesTruncated = found.Count > devLimit,
                    subnets,
                    ips = Array.Empty<object>(), locations = Array.Empty<object>(), racks = Array.Empty<object>(),
                });
            }

            var ipRows = (await db.IpAssignments.AsNoTracking()
                    .Select(i => new
                    {
                        i.Id, Ip = i.IpAddress, i.SubnetId,
                        SubnetName = i.Subnet != null ? i.Subnet.Name : null,
                        Status = i.Status,
                        DeviceId = i.DeviceId,
                        Device = i.Device != null ? i.Device.Name : null,
                        i.Notes,
                    })
                    .ToListAsync(ct))
                .Where(i => Has(i.Ip) || Has(i.Notes))
                .OrderBy(i => i.Ip, StringComparer.Ordinal).Take(otherLimit)
                .ToList();
            var ips = ipRows.Select(i => new { i.Id, i.Ip, i.SubnetId, i.SubnetName, Status = i.Status.ToString(), i.DeviceId, i.Device, i.Notes }).ToList();

            var locations = (await db.Locations.AsNoTracking()
                    .Select(l => new { l.Id, l.Name })
                    .ToListAsync(ct))
                .Where(l => Has(l.Name))
                .OrderBy(l => l.Name, StringComparer.OrdinalIgnoreCase).Take(otherLimit)
                .ToList();

            var racks = (await db.Racks.AsNoTracking()
                    .Select(r => new { r.Id, r.Name, r.Description, Location = r.LocationRef != null ? r.LocationRef.Name : null, r.RackUnits })
                    .ToListAsync(ct))
                .Where(r => Has(r.Name) || Has(r.Description) || Has(r.Location))
                .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase).Take(otherLimit)
                .ToList();

            return Results.Ok(new
            {
                query = term,
                devices, devicesTruncated = found.Count > devLimit,
                subnets, ips, locations, racks,
            });
        });
    }
}
