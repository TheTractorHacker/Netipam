using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Services;

namespace Netipam.Api;

public sealed class ScansApi : IApiModule
{
    public sealed record StartInput(int? SubnetId, string? Profile, string? Ports);

    public void Map(RouteGroupBuilder api)
    {
        api.MapPost("/scans", async (StartInput? body, AppDbContext db, NetworkScanService scans, ILogger<ScansApi> log, HttpContext http, CancellationToken ct) =>
        {
            if (body?.SubnetId is not int sid) return Results.BadRequest(new { error = "subnetId is required." });
            var profile = (body.Profile ?? "").Trim().ToLowerInvariant();
            if (!NetworkScanService.TryResolvePorts(profile, body.Ports, out var ports, out var perr))
                return Results.BadRequest(new { error = perr });

            var subnet = await db.Subnets.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sid, ct);
            if (subnet == null) return Results.BadRequest(new { error = "Subnet not found." });
            if (!IpCidr.TryParseIPv4Cidr((subnet.Cidr ?? "").Trim(), out var info, out var cerr))
                return Results.BadRequest(new { error = cerr ?? "Subnet has an invalid CIDR." });
            if (!NetworkScanService.IsPrivate(info))
                return Results.BadRequest(new { error = "Only private address ranges can be scanned." });

            var (first, last) = NetworkScanService.HostRange(info);
            var hosts = last - first + 1;
            if (hosts > NetworkScanService.MaxHosts)
                return Results.BadRequest(new { error = $"Subnet too large: at most {NetworkScanService.MaxHosts} hosts (/22) can be scanned." });
            if ((long)hosts * ports.Length > NetworkScanService.MaxProbes)
                return Results.BadRequest(new { error = "Too many probes (hosts x ports). Use fewer ports." });

            var devs = await db.Devices.AsNoTracking()
                .Where(d => d.IpAddress != null && d.IpAddress != "")
                .Select(d => new { d.Id, d.Name, d.IpAddress, d.IsOnline })
                .ToListAsync(ct);
            var known = devs.Select(d => (d.IpAddress!.Trim(), new NetworkScanService.KnownDevice(d.Id, d.Name, d.IsOnline)));

            var id = scans.TryStart(subnet.Id, subnet.Name, info, profile, ports, known);
            if (id == null) return Results.Conflict(new { error = "A scan is already running." });
            log.LogInformation("Network scan {ScanId} started by {User}: {Cidr} profile={Profile}", id, http.User.Identity?.Name ?? "unknown", info.Cidr, profile);
            return Results.Accepted($"/api/scans/{id}", new { id });
        }).RequireAuthorization("AdminOnly");

        api.MapGet("/scans", (NetworkScanService scans) => Results.Ok(new { items = scans.List() }))
            .RequireAuthorization("CanEdit");

        api.MapGet("/scans/{id}", (string id, NetworkScanService scans) =>
            scans.Get(id) is { } job ? Results.Ok(job) : Results.NotFound(new { error = "Scan not found." }))
            .RequireAuthorization("CanEdit");

        api.MapPost("/scans/{id}/cancel", (string id, NetworkScanService scans) =>
            scans.Cancel(id) ? Results.Ok(new { ok = true }) : Results.NotFound(new { error = "Scan not found." }))
            .RequireAuthorization("AdminOnly");
    }
}
