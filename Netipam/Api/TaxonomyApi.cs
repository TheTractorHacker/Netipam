using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using MudBlazor;
using Netipam.Helpers;

namespace Netipam.Api;

public sealed class TaxonomyApi : IApiModule
{
    public sealed record LocationRequest(string? Name, string? Description);
    public sealed record ClientTypeRequest(string? Name, string? Description, string? Icon, bool IsDevice, bool IsHost);

        private static readonly (string Label, string Svg)[] IconOptions =
    {
        ("Router/Gateway", Icons.Material.Filled.Router),
        ("Switch", Icons.Material.Filled.SettingsEthernet),
        ("Wireless AP", Icons.Material.Filled.Wifi),
        ("Server", Icons.Material.Filled.Dns),
        ("NAS/Storage", Icons.Material.Filled.Storage),
        ("Camera", Icons.Material.Filled.Videocam),
        ("NVR", Icons.Material.Filled.VideoLibrary),
        ("PC", Icons.Material.Filled.Computer),
        ("Laptop", Icons.Material.Filled.Laptop),
        ("Phone", Icons.Material.Filled.PhoneIphone),
        ("Tablet", Icons.Material.Filled.TabletMac),
        ("Printer", Icons.Material.Filled.Print),
        ("VM/Container", Icons.Material.Filled.Memory),
        ("IoT/Device", Icons.Material.Filled.Devices),
    };

    public void Map(RouteGroupBuilder api)
    {
        // ---------- Locations ----------
        api.MapGet("/locations", async (AppDbContext db, CancellationToken ct) =>
        {
            var locations = await db.Locations.AsNoTracking().OrderBy(l => l.Name).ToListAsync(ct);

            var byId = await db.Devices.AsNoTracking()
                .Where(d => d.LocationId != null)
                .GroupBy(d => d.LocationId!.Value)
                .Select(g => new { Id = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Id, x => x.Count, ct);

            var legacy = await db.Devices.AsNoTracking()
                .Where(d => d.LocationId == null && d.Location != null && d.Location.Trim() != "")
                .GroupBy(d => d.Location!.ToLower())
                .Select(g => new { Name = g.Key, Count = g.Count() })
                .ToListAsync(ct);
            var legacyByName = legacy.ToDictionary(x => x.Name, x => x.Count);

            var result = locations.Select(l =>
            {
                var count = byId.GetValueOrDefault(l.Id) + legacyByName.GetValueOrDefault(l.Name.ToLower());
                return new { l.Id, l.Name, l.Description, assigned = count };
            });
            return Results.Ok(result);
        });

        api.MapGet("/locations/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var l = await db.Locations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            return l is null
                ? Results.NotFound(new { error = "Location not found." })
                : Results.Ok(new { l.Id, l.Name, l.Description });
        });

        api.MapGet("/locations/{id:int}/devices", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var loc = await db.Locations.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id, ct);
            if (loc is null) return Results.NotFound(new { error = "Location not found." });

            var nameLower = loc.Name.ToLower();
            var rows = await db.Devices.AsNoTracking()
                .Where(d => d.LocationId == id ||
                            (d.LocationId == null && d.Location != null && d.Location.Trim() != "" && d.Location.ToLower() == nameLower))
                .OrderBy(d => d.Name)
                .Select(d => new
                {
                    d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress, d.AccessLink,
                    type = d.ClientType != null ? d.ClientType.Name : null,
                    subnetId = d.SubnetId,
                    subnet = d.Subnet != null ? d.Subnet.Name : null,
                    d.IsOnline, d.IsStatusTracked
                })
                .ToListAsync(ct);

            var devices = rows.Select(d => new
            {
                d.Id, d.Name, d.Hostname, d.IpAddress, d.MacAddress, d.type, d.subnetId, d.subnet,
                d.IsOnline, d.IsStatusTracked,
                accessHref = DisplayFormat.TryBuildAccessLink(d.AccessLink, out var href) ? href : null
            });
            return Results.Ok(new { location = new { loc.Id, loc.Name, loc.Description }, devices });
        });

        api.MapPost("/locations", async (LocationRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var name = req.Name?.Trim();
            if (string.IsNullOrEmpty(name)) return Results.BadRequest(new { error = "Name is required." });
            if (await db.Locations.AnyAsync(l => l.Name.ToLower() == name.ToLower(), ct))
                return Results.Conflict(new { error = $"A location named '{name}' already exists." });
            var e = new Location { Name = name, Description = Clean(req.Description) };
            db.Locations.Add(e);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { e.Id, e.Name, e.Description });
        }).RequireAuthorization("CanEdit");

        api.MapPut("/locations/{id:int}", async (int id, LocationRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.Locations.FirstOrDefaultAsync(l => l.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Location not found." });
            var name = req.Name?.Trim();
            if (string.IsNullOrEmpty(name)) return Results.BadRequest(new { error = "Name is required." });
            var oldLower = e.Name.ToLower();
            if (oldLower != name.ToLower())
            {
                // Pin legacy devices matched only by the old free-text name so a rename does not orphan them.
                var legacy = await db.Devices
                    .Where(d => d.LocationId == null && d.Location != null && d.Location.Trim() != "" && d.Location.ToLower() == oldLower)
                    .ToListAsync(ct);
                foreach (var d in legacy)
                {
                    d.LocationId = e.Id;
                    d.Location = name;
                }
            }
            e.Name = name;
            e.Description = Clean(req.Description);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { e.Id, e.Name, e.Description });
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/locations/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.Locations.FirstOrDefaultAsync(l => l.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Location not found." });
            var nameLower = e.Name.ToLower();
            var inUse = await db.Devices.AsNoTracking().AnyAsync(d =>
                d.LocationId == id ||
                (d.LocationId == null && d.Location != null && d.Location.Trim() != "" && d.Location.ToLower() == nameLower), ct);
            if (inUse)
                return Results.Json(new { error = "Cannot delete: this location is assigned to one or more devices." }, statusCode: 409);
            db.Locations.Remove(e);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        // ---------- Client types ----------
        api.MapGet("/client-types", async (AppDbContext db, CancellationToken ct) =>
        {
            var counts = await db.Devices.AsNoTracking()
                .Where(d => d.ClientTypeId != null)
                .GroupBy(d => d.ClientTypeId!.Value)
                .Select(g => new { Id = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Id, x => x.Count, ct);

            var types = await db.ClientTypes.AsNoTracking().OrderBy(t => t.Name).ToListAsync(ct);
            return Results.Ok(types.Select(t => new
            {
                t.Id, t.Name, t.Description, t.Icon, t.IsDevice, t.IsHost,
                assigned = counts.GetValueOrDefault(t.Id)
            }));
        });

        api.MapGet("/client-types/icons", () =>
            Results.Ok(IconOptions.Select(o => new { label = o.Label, svg = o.Svg })));

        api.MapPost("/client-types", async (ClientTypeRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var name = req.Name?.Trim();
            if (string.IsNullOrEmpty(name)) return Results.BadRequest(new { error = "Name is required." });
            var icon = Clean(req.Icon);
            if (icon is not null && !IconOptions.Any(o => o.Svg == icon))
                return Results.BadRequest(new { error = "Unknown icon." });
            var e = new ClientType
            {
                Name = name, Description = Clean(req.Description), Icon = icon,
                IsDevice = req.IsDevice, IsHost = req.IsHost
            };
            db.ClientTypes.Add(e);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { e.Id });
        }).RequireAuthorization("CanEdit");

        api.MapPut("/client-types/{id:int}", async (int id, ClientTypeRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.ClientTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Client type not found." });
            var name = req.Name?.Trim();
            if (string.IsNullOrEmpty(name)) return Results.BadRequest(new { error = "Name is required." });
            e.Name = name;
            e.Description = Clean(req.Description);
            var icon = Clean(req.Icon);
            if (icon is not null && icon != e.Icon && !IconOptions.Any(o => o.Svg == icon))
                return Results.BadRequest(new { error = "Unknown icon." });
            e.Icon = icon;
            e.IsDevice = req.IsDevice;
            e.IsHost = req.IsHost;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { e.Id });
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/client-types/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.ClientTypes.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Client type not found." });
            if (await db.Devices.AsNoTracking().AnyAsync(d => d.ClientTypeId == id, ct))
                return Results.Json(new { error = "Cannot delete: this type is assigned to one or more clients." }, statusCode: 409);
            db.ClientTypes.Remove(e);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
