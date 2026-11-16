using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Api;

public sealed class UsersApi : IApiModule
{
    public sealed record CreateUserRequest(string? Username, string? Password, string? Role);
    public sealed record SetupRequest(string? Username, string? Password, string? ConfirmPassword);
    public sealed record RolesRequest(string[]? Roles);
    public sealed record ResetPasswordRequest(string? NewPassword);
    public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

    private const string Admin = "Admin";

    private static string Errors(IdentityResult r) => string.Join(" | ", r.Errors.Select(e => e.Description));

    private static IResult Bad(string msg) => Results.BadRequest(new { error = msg });

    public void Map(RouteGroupBuilder api)
    {
        // ---- first-run setup (anonymous, only while no users exist) ----
        api.MapGet("/auth/setup-status", async (UserManager<ApplicationUser> users) =>
            Results.Ok(new { needed = !await users.Users.AnyAsync() })).AllowAnonymous();

        api.MapPost("/auth/setup", async (SetupRequest req, UserManager<ApplicationUser> users, RoleManager<IdentityRole> roles) =>
        {
            if (await users.Users.AnyAsync())
                return Results.Json(new { error = "An admin account already exists. Please sign in." }, statusCode: 409);

            var username = (req.Username ?? "").Trim();
            if (username.Length == 0) return Bad("Username is required.");
            if (string.IsNullOrWhiteSpace(req.Password)) return Bad("Password is required.");
            if (!string.Equals(req.Password, req.ConfirmPassword, StringComparison.Ordinal)) return Bad("Passwords do not match.");

            foreach (var r in new[] { "Admin", "Editor", "Viewer" })
                if (!await roles.RoleExistsAsync(r)) await roles.CreateAsync(new IdentityRole(r));

            var user = new ApplicationUser { UserName = username, Email = null, EmailConfirmed = true };
            var create = await users.CreateAsync(user, req.Password);
            if (!create.Succeeded) return Bad(Errors(create));

            await users.AddToRoleAsync(user, Admin);
            return Results.Ok(new { ok = true });
        }).AllowAnonymous();

        // ---- admin user management ----
        api.MapGet("/users", async (UserManager<ApplicationUser> users, RoleManager<IdentityRole> roleMgr, HttpContext http) =>
        {
            var list = await users.Users.AsNoTracking().OrderBy(u => u.UserName).ToListAsync();
            var currentId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var rows = new List<object>();
            foreach (var u in list)
            {
                var rs = (await users.GetRolesAsync(u)).OrderBy(x => x).ToArray();
                rows.Add(new { id = u.Id, username = u.UserName, roles = rs, isSelf = u.Id == currentId });
            }
            var allRoles = await roleMgr.Roles.Select(r => r.Name!).OrderBy(x => x).ToListAsync();
            return Results.Ok(new { users = rows, allRoles });
        }).RequireAuthorization("AdminOnly");

        api.MapPost("/users", async (CreateUserRequest req, UserManager<ApplicationUser> users, RoleManager<IdentityRole> roleMgr) =>
        {
            var username = (req.Username ?? "").Trim();
            if (username.Length == 0) return Bad("Username is required.");
            if (string.IsNullOrEmpty(req.Password)) return Bad("Password is required.");
            var role = string.IsNullOrWhiteSpace(req.Role) ? null : req.Role.Trim();
            if (role != null && !await roleMgr.RoleExistsAsync(role)) return Bad($"Role '{role}' does not exist.");
            if (await users.FindByNameAsync(username) != null) return Bad($"Username '{username}' is already taken.");

            var u = new ApplicationUser { UserName = username };
            var res = await users.CreateAsync(u, req.Password);
            if (!res.Succeeded) return Bad(Errors(res));
            if (role != null)
            {
                var rr = await users.AddToRoleAsync(u, role);
                if (!rr.Succeeded) return Bad(Errors(rr));
            }
            return Results.Ok(new { id = u.Id });
        }).RequireAuthorization("AdminOnly");

        api.MapPut("/users/{id}/roles", async (string id, RolesRequest req, UserManager<ApplicationUser> users, RoleManager<IdentityRole> roleMgr) =>
        {
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound(new { error = "User not found." });

            var selected = new HashSet<string>(req.Roles ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            foreach (var r in selected)
                if (!await roleMgr.RoleExistsAsync(r)) return Bad($"Role '{r}' does not exist.");

            var current = await users.GetRolesAsync(user);
            var toAdd = selected.Except(current, StringComparer.OrdinalIgnoreCase).ToList();
            var toRemove = current.Except(selected, StringComparer.OrdinalIgnoreCase).ToList();

            if (toRemove.Contains(Admin, StringComparer.OrdinalIgnoreCase) && await IsLastAdmin(users, user))
                return Bad("Cannot remove the Admin role from the last Admin.");

            if (toRemove.Count > 0)
            {
                var rr = await users.RemoveFromRolesAsync(user, toRemove);
                if (!rr.Succeeded) return Bad(Errors(rr));
            }
            if (toAdd.Count > 0)
            {
                var ar = await users.AddToRolesAsync(user, toAdd);
                if (!ar.Succeeded) return Bad(Errors(ar));
            }
            return Results.Ok(new { ok = true });
        }).RequireAuthorization("AdminOnly");

        api.MapPost("/users/{id}/reset-password", async (string id, ResetPasswordRequest req, UserManager<ApplicationUser> users) =>
        {
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound(new { error = "User not found." });
            if (string.IsNullOrEmpty(req.NewPassword)) return Bad("New password is required.");

            var token = await users.GeneratePasswordResetTokenAsync(user);
            var res = await users.ResetPasswordAsync(user, token, req.NewPassword);
            return res.Succeeded ? Results.Ok(new { ok = true }) : Bad(Errors(res));
        }).RequireAuthorization("AdminOnly");

        api.MapDelete("/users/{id}", async (string id, UserManager<ApplicationUser> users, HttpContext http) =>
        {
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound(new { error = "User not found." });
            if (user.Id == http.User.FindFirstValue(ClaimTypes.NameIdentifier))
                return Bad("You cannot delete your own account.");
            if (await users.IsInRoleAsync(user, Admin) && await IsLastAdmin(users, user))
                return Bad("Cannot delete the last Admin.");

            var res = await users.DeleteAsync(user);
            return res.Succeeded ? Results.Ok(new { ok = true }) : Bad(Errors(res));
        }).RequireAuthorization("AdminOnly");

        // ---- change my own password (any signed-in user) ----
        api.MapPost("/account/password", async (ChangePasswordRequest req, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, HttpContext http) =>
        {
            var user = await users.GetUserAsync(http.User);
            if (user is null) return Results.Json(new { error = "Not signed in." }, statusCode: 401);
            if (string.IsNullOrEmpty(req.CurrentPassword)) return Bad("Current password is required.");
            if (string.IsNullOrEmpty(req.NewPassword)) return Bad("New password is required.");

            var res = await users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
            if (!res.Succeeded) return Bad(Errors(res));
            await signIn.RefreshSignInAsync(user);
            return Results.Ok(new { ok = true });
        });
    }

    private static async Task<bool> IsLastAdmin(UserManager<ApplicationUser> users, ApplicationUser user)
    {
        var admins = await users.GetUsersInRoleAsync(Admin);
        return !admins.Any(a => a.Id != user.Id);
    }
}
