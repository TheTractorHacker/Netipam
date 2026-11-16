using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Api;

public sealed class SubnetsApi : IApiModule
{
    public void Map(RouteGroupBuilder api)
    {
        api.MapGet("/subnets", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.Subnets.AsNoTracking().OrderBy(s => s.Name)
                .Select(s => new { s.Id, s.Name, s.Cidr, s.Description, s.VlanId, s.DhcpRangeStart, s.DhcpRangeEnd, s.Dns1, s.Dns2 })
                .ToListAsync(ct)));
    }
}
