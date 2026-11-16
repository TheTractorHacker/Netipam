using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Helpers;

namespace Netipam.Api;

public sealed class AccessApi : IApiModule
{
    public sealed record CategoryBody(string? Name, string? Description);
    public sealed record ItemOrderBody(int? CategoryId, List<int>? DeviceIds);
    public sealed record OrderBody(List<int>? CategoryIds, List<ItemOrderBody>? Items);

    public void Map(RouteGroupBuilder api)
    {
        // Launcher panel: devices with an access link, grouped by category, in the user's order.
        api.MapGet("/access/panel", async (AppDbContext db, HttpContext http) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var devices = await db.Devices.AsNoTracking()
                .Include(d => d.ClientType)
                .Include(d => d.AccessCategory)
                .Where(d => d.AccessLink != null && d.AccessLink != "")
                .OrderBy(d => d.Name)
                .ToListAsync();
            devices = devices.Where(d => !string.IsNullOrWhiteSpace(d.AccessLink)).ToList();

            var (catOrder, itemOrder) = await LoadOrders(db, userId);

            var groups = devices
                .GroupBy(d => d.AccessCategoryId)
                .Select(g => new
                {
                    categoryId = g.Key,
                    name = string.IsNullOrWhiteSpace(g.First().AccessCategory?.Name) ? "Uncategorized" : g.First().AccessCategory!.Name,
                    description = g.First().AccessCategory?.Description,
                    devices = g
                        .OrderBy(d => itemOrder.TryGetValue(d.Id, out var o) ? o : int.MaxValue)
                        .ThenBy(d => d.Name)
                        .Select(d => new
                        {
                            id = d.Id,
                            name = d.Name,
                            href = DisplayFormat.TryBuildAccessLink(d.AccessLink, out var href) ? href : null,
                            rawLink = d.AccessLink,
                            tracked = d.IsStatusTracked,
                            online = d.IsOnline,
                            clientType = d.ClientType?.Name,
                            icon = d.ClientType?.Icon,
                            ipPort = DisplayFormat.FormatIpWithPort(d),
                        }).ToList(),
                })
                .OrderBy(g => g.categoryId is null ? 1 : 0)
                .ThenBy(g => g.categoryId is not null && catOrder.TryGetValue(g.categoryId.Value, out var o) ? o : int.MaxValue)
                .ThenBy(g => g.name)
                .ToList();

            return Results.Ok(new { total = devices.Count, groups });
        });

        // Data for the arrange dialog.
        api.MapGet("/access/order", async (AppDbContext db, HttpContext http) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var cats = await db.AccessCategories.AsNoTracking().OrderBy(c => c.Name).ToListAsync();
            var devices = await db.Devices.AsNoTracking()
                .Where(d => d.AccessLink != null && d.AccessLink != "")
                .OrderBy(d => d.Name)
                .Select(d => new { d.Id, d.Name, d.AccessCategoryId, d.AccessLink })
                .ToListAsync();
            devices = devices.Where(d => !string.IsNullOrWhiteSpace(d.AccessLink)).ToList();
            var (catOrder, itemOrder) = await LoadOrders(db, userId);

            var categories = cats
                .OrderBy(c => catOrder.TryGetValue(c.Id, out var o) ? o : int.MaxValue)
                .ThenBy(c => c.Name)
                .Select(c => new { id = c.Id, name = c.Name })
                .ToList();

            var lists = devices.GroupBy(d => d.AccessCategoryId).Select(g => new
            {
                categoryId = g.Key,
                devices = g.OrderBy(d => itemOrder.TryGetValue(d.Id, out var o) ? o : int.MaxValue)
                    .ThenBy(d => d.Name)
                    .Select(d => new { id = d.Id, name = d.Name }).ToList(),
            }).ToList();

            return Results.Ok(new { categories, items = lists });
        });

        // Per-user ordering: replaces all of the caller's rows (as the classic dialog did).
        api.MapPut("/access/order", async (OrderBody body, AppDbContext db, HttpContext http) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(userId))
                return Results.BadRequest(new { error = "Could not identify the current user." });

            var validCats = (await db.AccessCategories.AsNoTracking().Select(c => c.Id).ToListAsync()).ToHashSet();
            var validDevices = (await db.Devices.AsNoTracking().Select(d => d.Id).ToListAsync()).ToHashSet();

            await using var tx = await db.Database.BeginTransactionAsync();
            db.UserAccessCategoryOrders.RemoveRange(await db.UserAccessCategoryOrders.Where(o => o.UserId == userId).ToListAsync());
            db.UserAccessItemOrders.RemoveRange(await db.UserAccessItemOrders.Where(o => o.UserId == userId).ToListAsync());
            await db.SaveChangesAsync();

            var seenCats = new HashSet<int>();
            var i = 0;
            foreach (var id in body.CategoryIds ?? new())
            {
                if (!validCats.Contains(id) || !seenCats.Add(id)) continue;
                db.UserAccessCategoryOrders.Add(new UserAccessCategoryOrder { UserId = userId, AccessCategoryId = id, SortOrder = i++ });
            }

            var seenDevs = new HashSet<int>();
            foreach (var list in body.Items ?? new())
            {
                if (list is null) continue;
                var n = 0;
                foreach (var id in list.DeviceIds ?? new())
                {
                    if (!validDevices.Contains(id) || !seenDevs.Add(id)) continue;
                    db.UserAccessItemOrders.Add(new UserAccessItemOrder { UserId = userId, DeviceId = id, SortOrder = n++ });
                }
            }

            try
            {
                await db.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { error = "Could not save the order; it may have changed elsewhere. Reload and try again." });
            }
            return Results.Ok(new { ok = true });
        });

        api.MapGet("/access/categories", async (AppDbContext db) =>
        {
            var rows = await db.AccessCategories.AsNoTracking().OrderBy(c => c.Name)
                .Select(c => new { id = c.Id, name = c.Name, description = c.Description, deviceCount = c.Devices.Count })
                .ToListAsync();
            return Results.Ok(rows);
        });

        api.MapPost("/access/categories", async (CategoryBody body, AppDbContext db) =>
        {
            var name = body.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name))
                return Results.BadRequest(new { error = "Name is required." });
            var e = new AccessCategory { Name = name, Description = Clean(body.Description) };
            db.AccessCategories.Add(e);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = e.Id, name = e.Name, description = e.Description, deviceCount = 0 });
        }).RequireAuthorization("CanEdit");

        api.MapPut("/access/categories/{id:int}", async (int id, CategoryBody body, AppDbContext db) =>
        {
            var e = await db.AccessCategories.FirstOrDefaultAsync(c => c.Id == id);
            if (e is null) return Results.NotFound(new { error = "Access category not found." });
            var name = body.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name))
                return Results.BadRequest(new { error = "Name is required." });
            e.Name = name;
            e.Description = Clean(body.Description);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = e.Id, name = e.Name, description = e.Description });
        }).RequireAuthorization("CanEdit");

        api.MapDelete("/access/categories/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Devices.AsNoTracking().AnyAsync(d => d.AccessCategoryId == id))
                return Results.Json(new { error = "Cannot delete: this category is assigned to one or more devices." }, statusCode: 409);
            var e = await db.AccessCategories.FirstOrDefaultAsync(c => c.Id == id);
            if (e is null) return Results.NotFound(new { error = "Access category not found." });
            db.AccessCategories.Remove(e);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("CanEdit");
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static async Task<(Dictionary<int, int> cats, Dictionary<int, int> items)> LoadOrders(AppDbContext db, string? userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return (new(), new());
        var cats = await db.UserAccessCategoryOrders.AsNoTracking().Where(o => o.UserId == userId)
            .ToDictionaryAsync(o => o.AccessCategoryId, o => o.SortOrder);
        var items = await db.UserAccessItemOrders.AsNoTracking().Where(o => o.UserId == userId)
            .ToDictionaryAsync(o => o.DeviceId, o => o.SortOrder);
        return (cats, items);
    }
}
