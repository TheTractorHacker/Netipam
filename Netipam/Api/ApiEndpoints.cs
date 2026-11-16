using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Api;

/// <summary>JSON API consumed by the React front end (served at /app).</summary>
public static class ApiEndpoints
{
    public sealed record LoginRequest(string Username, string Password, bool RememberMe);

    public static void MapNetipamApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        // ---- Auth ----
        api.MapPost("/auth/login", async (LoginRequest req, SignInManager<ApplicationUser> signIn) =>
        {
            var result = await signIn.PasswordSignInAsync(req.Username ?? "", req.Password ?? "", req.RememberMe, lockoutOnFailure: false);
            return result.Succeeded
                ? Results.Ok(new { ok = true })
                : Results.Json(new { ok = false, error = "Invalid username or password." }, statusCode: 401);
        }).AllowAnonymous();

        api.MapPost("/auth/logout", async (SignInManager<ApplicationUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.Ok(new { ok = true });
        }).AllowAnonymous();

        api.MapGet("/auth/me", (HttpContext http) =>
        {
            var u = http.User;
            if (u.Identity?.IsAuthenticated != true)
                return Results.Ok(new { authenticated = false });
            var roles = new[] { "Admin", "Editor", "Viewer" }.Where(u.IsInRole).ToArray();
            return Results.Ok(new { authenticated = true, name = u.Identity!.Name, roles });
        }).AllowAnonymous();

        // ---- Dashboard ----
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

        // ---- Devices / clients ----
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

        // ---- Subnets ----
        api.MapGet("/subnets", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.Subnets.AsNoTracking().OrderBy(s => s.Name)
                .Select(s => new { s.Id, s.Name, s.Cidr, s.Description, s.VlanId, s.DhcpRangeStart, s.DhcpRangeEnd, s.Dns1, s.Dns2 })
                .ToListAsync(ct)));

        api.MapFallback("/api/{**rest}", () => Results.NotFound(new { error = "Not found" })).AllowAnonymous();
    }
}
