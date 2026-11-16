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
            var term = (q ?? "").Trim().ToLowerInvariant();
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

            var found = await db.Devices.AsNoTracking()
                .Where(d =>
                    d.Name.ToLower().Contains(term) ||
                    (d.Hostname != null && d.Hostname.ToLower().Contains(term)) ||
                    (d.IpAddress != null && d.IpAddress.Contains(term)) ||
                    (d.MacAddress != null && d.MacAddress.ToLower().Contains(term)) ||
                    (!small && d.Manufacturer != null && d.Manufacturer.ToLower().Contains(term)) ||
                    (!small && d.Model != null && d.Model.ToLower().Contains(term)) ||
                    (!small && d.OperatingSystem != null && d.OperatingSystem.ToLower().Contains(term)) ||
                    (!small && d.Description != null && d.Description.ToLower().Contains(term)) ||
                    (!small && d.Usage != null && d.Usage.ToLower().Contains(term)) ||
                    (!small && d.AssetNumber != null && d.AssetNumber.ToLower().Contains(term)) ||
                    (!small && d.Location != null && d.Location.ToLower().Contains(term)) ||
                    (!small && d.LocationRef != null && d.LocationRef.Name.ToLower().Contains(term)) ||
                    (!small && d.ClientType != null && d.ClientType.Name.ToLower().Contains(term)) ||
                    (!small && d.Subnet != null && d.Subnet.Name.ToLower().Contains(term)))
                .OrderBy(d => d.Name)
                .Take(devLimit + 1)
                .Select(d => new
                {
                    d.Id, d.Name, d.Manufacturer, d.Model, d.Hostname,
                    Ip = d.IpAddress, Mac = d.MacAddress,
                    Type = d.ClientType != null ? d.ClientType.Name : null,
                    IsDevice = d.ClientType != null && d.ClientType.IsDevice,
                    Location = d.LocationRef != null ? d.LocationRef.Name : d.Location,
                    Subnet = d.Subnet != null ? d.Subnet.Name : null,
                    Online = d.IsOnline,
                })
                .ToListAsync(ct);

            var devices = found.Take(devLimit).Select(d => new
            {
                d.Id,
                d.Name,
                Detail = string.Join(" · ", new[] { d.Manufacturer, d.Model, d.Hostname }.Where(x => !string.IsNullOrWhiteSpace(x))),
                d.Ip, d.Mac, d.Type, d.Location, d.Subnet, d.Online, d.IsDevice,
            }).ToList();

            var subnets = await db.Subnets.AsNoTracking()
                .Where(s => s.Name.ToLower().Contains(term) || s.Cidr.Contains(term) ||
                            (!small && s.Description != null && s.Description.ToLower().Contains(term)))
                .OrderBy(s => s.Name).Take(otherLimit)
                .Select(s => new { s.Id, s.Name, s.Cidr, s.VlanId, s.Description })
                .ToListAsync(ct);

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

            var ipRows = await db.IpAssignments.AsNoTracking()
                .Where(i => i.IpAddress.Contains(term) || (i.Notes != null && i.Notes.ToLower().Contains(term)))
                .OrderBy(i => i.IpAddress).Take(otherLimit)
                .Select(i => new
                {
                    i.Id, Ip = i.IpAddress, i.SubnetId,
                    SubnetName = i.Subnet != null ? i.Subnet.Name : null,
                    Status = i.Status,
                    DeviceId = i.DeviceId,
                    Device = i.Device != null ? i.Device.Name : null,
                    i.Notes,
                })
                .ToListAsync(ct);
            var ips = ipRows.Select(i => new { i.Id, i.Ip, i.SubnetId, i.SubnetName, Status = i.Status.ToString(), i.DeviceId, i.Device, i.Notes }).ToList();

            var locations = await db.Locations.AsNoTracking()
                .Where(l => l.Name.ToLower().Contains(term))
                .OrderBy(l => l.Name).Take(otherLimit)
                .Select(l => new { l.Id, l.Name })
                .ToListAsync(ct);

            var racks = await db.Racks.AsNoTracking()
                .Where(r => r.Name.ToLower().Contains(term) ||
                            (r.Description != null && r.Description.ToLower().Contains(term)) ||
                            (r.LocationRef != null && r.LocationRef.Name.ToLower().Contains(term)))
                .OrderBy(r => r.Name).Take(otherLimit)
                .Select(r => new { r.Id, r.Name, r.Description, Location = r.LocationRef != null ? r.LocationRef.Name : null, r.RackUnits })
                .ToListAsync(ct);

            return Results.Ok(new
            {
                query = term,
                devices, devicesTruncated = found.Count > devLimit,
                subnets, ips, locations, racks,
            });
        });
    }
}
