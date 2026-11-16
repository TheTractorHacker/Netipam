using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Helpers;

namespace Netipam.Api;

public sealed class RacksApi : IApiModule
{
    private const int DefaultRackUnits = 42;
    private const int MaxUPosition = 60;
    private const int MaxUSize = 10;
    private const int MaxRackUnits = 60;
    private const string DuplicateMarker = "\u0001";

    public sealed record RackInput(string? Name, string? Description, int? LocationId, int? RackUnits);
    public sealed record PlacementInput(int? UPosition, int? USize);

    public void Map(RouteGroupBuilder api)
    {
        api.MapGet("/racks", async (AppDbContext db, CancellationToken ct) =>
        {
            var racks = await db.Racks.AsNoTracking()
                .OrderBy(r => r.Name)
                .Select(r => new
                {
                    r.Id, r.Name, r.Description, r.LocationId,
                    location = r.LocationRef != null ? r.LocationRef.Name : null,
                    r.RackUnits
                })
                .ToListAsync(ct);

            var devs = await db.Devices.AsNoTracking()
                .Where(d => d.RackId != null)
                .Select(d => new { RackId = d.RackId!.Value, d.RackUPosition, d.RackUSize })
                .ToListAsync(ct);

            var list = racks.Select(r =>
            {
                var mine = devs.Where(d => d.RackId == r.Id).ToList();
                var used = mine.Where(d => d.RackUPosition != null && d.RackUSize != null)
                    .Sum(d => Math.Max(1, d.RackUSize!.Value));
                var total = r.RackUnits ?? DefaultRackUnits;
                return new
                {
                    r.Id, r.Name, r.Description, r.LocationId, r.location, r.RackUnits,
                    totalUnits = total,
                    deviceCount = mine.Count,
                    usedUnits = used,
                    freeUnits = Math.Max(0, total - used),
                    unplacedCount = mine.Count(d => d.RackUPosition == null || d.RackUSize == null)
                };
            }).ToList();

            return Results.Ok(new { defaultUnits = DefaultRackUnits, racks = list });
        });

        api.MapGet("/racks/options", async (AppDbContext db, CancellationToken ct) =>
        {
            var locations = await db.Locations.AsNoTracking().OrderBy(l => l.Name)
                .Select(l => new { l.Id, l.Name }).ToListAsync(ct);
            var unassigned = await db.Devices.AsNoTracking()
                .Where(d => d.RackId == null)
                .OrderBy(d => d.Name)
                .Select(d => new
                {
                    d.Id, d.Name, d.IpAddress,
                    type = d.ClientType != null ? d.ClientType.Name : null,
                    isDevice = d.ClientType != null && d.ClientType.IsDevice
                })
                .ToListAsync(ct);
            return Results.Ok(new { locations, unassignedDevices = unassigned });
        });

        api.MapGet("/racks/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var rack = await db.Racks.AsNoTracking()
                .Where(r => r.Id == id)
                .Select(r => new
                {
                    r.Id, r.Name, r.Description, r.LocationId,
                    location = r.LocationRef != null ? r.LocationRef.Name : null,
                    r.RackUnits
                })
                .FirstOrDefaultAsync(ct);
            if (rack is null) return Results.NotFound(new { error = "Rack not found." });

            var devices = await db.Devices.AsNoTracking()
                .Where(d => d.RackId == id)
                .OrderBy(d => d.Name)
                .Select(d => new
                {
                    d.Id, d.Name, d.IpAddress, d.Manufacturer, d.Model, d.AccessLink,
                    type = d.ClientType != null ? d.ClientType.Name : null,
                    isDevice = d.ClientType != null && d.ClientType.IsDevice,
                    uPosition = d.RackUPosition,
                    uSize = d.RackUSize,
                    d.IsOnline, d.IsStatusTracked
                })
                .ToListAsync(ct);

            var placed = devices.Where(d => d.uPosition != null && d.uSize != null).ToList();
            var occupancy = new Dictionary<int, int>();
            foreach (var d in placed)
            {
                var size = Math.Max(1, d.uSize!.Value);
                for (var u = d.uPosition!.Value; u < d.uPosition.Value + size; u++)
                    occupancy[u] = occupancy.GetValueOrDefault(u) + 1;
            }

            var shaped = devices.Select(d =>
            {
                var isPlaced = d.uPosition != null && d.uSize != null;
                var size = isPlaced ? Math.Max(1, d.uSize!.Value) : (int?)null;
                var overlap = isPlaced &&
                    Enumerable.Range(d.uPosition!.Value, size!.Value).Any(u => occupancy.GetValueOrDefault(u) > 1);
                var href = DisplayFormat.TryBuildAccessLink(d.AccessLink, out var h) ? h : null;
                return new
                {
                    d.Id, d.Name, d.IpAddress, d.Manufacturer, d.Model, d.type, d.isDevice,
                    d.uPosition, uSize = size, placed = isPlaced, overlap,
                    link = href, d.IsOnline, d.IsStatusTracked
                };
            }).ToList();

            var maxUsed = placed.Count == 0 ? 0 : placed.Max(d => d.uPosition!.Value + Math.Max(1, d.uSize!.Value) - 1);
            var totalUnits = Math.Max(rack.RackUnits ?? DefaultRackUnits, maxUsed);

            return Results.Ok(new { rack, devices = shaped, totalUnits, defaultUnits = DefaultRackUnits });
        });

        api.MapPost("/racks", async (RackInput req, AppDbContext db, CancellationToken ct) =>
        {
            var err = await Validate(req, null, db, ct);
            if (err is not null) return Fail(err);
            var rack = new Rack
            {
                Name = req.Name!.Trim(),
                Description = Clean(req.Description),
                LocationId = req.LocationId,
                RackUnits = req.RackUnits
            };
            db.Racks.Add(rack);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = rack.Id });
        }).RequireAuthorization("CanEdit");

        api.MapPut("/racks/{id:int}", async (int id, RackInput req, AppDbContext db, CancellationToken ct) =>
        {
            var rack = await db.Racks.FirstOrDefaultAsync(r => r.Id == id, ct);
            if (rack is null) return Results.NotFound(new { error = "Rack not found." });
            var err = await Validate(req, id, db, ct);
            if (err is not null) return Fail(err);
            rack.Name = req.Name!.Trim();
            rack.Description = Clean(req.Description);
            rack.LocationId = req.LocationId;
            rack.RackUnits = req.RackUnits;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = rack.Id });
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/racks/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            if (await db.Devices.AsNoTracking().AnyAsync(d => d.RackId == id, ct))
                return Results.Conflict(new { error = "Cannot delete: this rack is assigned to one or more devices." });
            var rack = await db.Racks.FirstOrDefaultAsync(r => r.Id == id, ct);
            if (rack is null) return Results.NotFound(new { error = "Rack not found." });
            db.Racks.Remove(rack);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        // Assign a device to a rack, or move/resize it within the rack.
        api.MapPut("/racks/{id:int}/devices/{deviceId:int}", async (int id, int deviceId, PlacementInput req, AppDbContext db, CancellationToken ct) =>
        {
            if (!await db.Racks.AsNoTracking().AnyAsync(r => r.Id == id, ct))
                return Results.NotFound(new { error = "Rack not found." });
            var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId, ct);
            if (device is null) return Results.NotFound(new { error = "Device not found." });
            if ((req.UPosition is null) != (req.USize is null))
                return Results.BadRequest(new { error = "Provide both U position and size, or neither." });
            if (req.UPosition is < 1) return Results.BadRequest(new { error = "U position must be at least 1." });
            if (req.USize is < 1) return Results.BadRequest(new { error = "Size must be at least 1U." });
            // Same bounds as DevicesApi so a placement made here can be re-saved from the device editor.
            if (req.UPosition > MaxUPosition) return Results.BadRequest(new { error = $"U position must be 1-{MaxUPosition}." });
            if (req.USize > MaxUSize) return Results.BadRequest(new { error = $"Size must be 1-{MaxUSize}U." });

            device.RackId = id;
            device.RackUPosition = req.UPosition;
            device.RackUSize = req.USize;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/racks/{id:int}/devices/{deviceId:int}", async (int id, int deviceId, AppDbContext db, CancellationToken ct) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId && d.RackId == id, ct);
            if (device is null) return Results.NotFound(new { error = "Device not found in this rack." });
            device.RackId = null;
            device.RackUPosition = null;
            device.RackUSize = null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // Errors starting with DuplicateMarker map to 409, all others to 400.
    private static IResult Fail(string err) => err.StartsWith(DuplicateMarker, StringComparison.Ordinal)
        ? Results.Conflict(new { error = err[DuplicateMarker.Length..] })
        : Results.BadRequest(new { error = err });

    private static async Task<string?> Validate(RackInput req, int? currentId, AppDbContext db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name)) return "Name is required.";
        var name = req.Name.Trim();
        if (name.Length > 100) return "Name must be 100 characters or less.";
        if (req.Description is not null && req.Description.Trim().Length > 500) return "Description must be 500 characters or less.";
        if (req.RackUnits is < 1) return "Rack size must be at least 1U.";
        if (req.RackUnits > MaxRackUnits) return $"Rack size must be {MaxRackUnits}U or less.";
        var lower = name.ToLower();
        if (await db.Racks.AsNoTracking().AnyAsync(r => r.Id != currentId && r.Name.ToLower() == lower, ct))
            return DuplicateMarker + "A rack with this name already exists.";
        if (req.LocationId is not null && !await db.Locations.AsNoTracking().AnyAsync(l => l.Id == req.LocationId, ct))
            return "Location not found.";
        return null;
    }
}
