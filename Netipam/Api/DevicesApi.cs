using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Api;

public sealed class DevicesApi : IApiModule
{
    public void Map(RouteGroupBuilder api)
    {
        api.MapGet("/devices", async (string? kind, string? q, AppDbContext db, CancellationToken ct) =>
        {
            var query = db.Devices.AsNoTracking().AsQueryable();
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

            var list = await query
                .OrderBy(d => d.Name)
                .Take(2000)
                .Select(d => new
                {
                    d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress,
                    d.Manufacturer, d.Model,
                    type = d.ClientType != null ? d.ClientType.Name : null,
                    isDevice = d.ClientType != null && d.ClientType.IsDevice,
                    subnet = d.Subnet != null ? d.Subnet.Name : null,
                    location = d.LocationRef != null ? d.LocationRef.Name : null,
                    d.IsOnline, d.IsStatusTracked, d.IsCritical, d.LastSeenAt
                })
                .ToListAsync(ct);
            return Results.Ok(list);
        });
    }
}
