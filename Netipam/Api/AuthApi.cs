using Microsoft.AspNetCore.Identity;
using Netipam.Data;

namespace Netipam.Api;

public sealed class AuthApi : IApiModule
{
    public sealed record LoginRequest(string Username, string Password, bool RememberMe);

    public void Map(RouteGroupBuilder api)
    {
        api.MapPost("/auth/login", async (LoginRequest req, SignInManager<ApplicationUser> signIn) =>
        {
            var result = await signIn.PasswordSignInAsync(req.Username ?? "", req.Password ?? "", req.RememberMe, lockoutOnFailure: true);
            if (result.Succeeded) return Results.Ok(new { ok = true });

            // Wrong password, unknown user and locked-out account all get the identical reply, so the
            // response never reveals which usernames exist. Per-IP throttling (RequireRateLimiting) slows guessing.
            return Results.Json(
                new { ok = false, error = "Invalid username or password. If this keeps happening, wait a few minutes and try again." },
                statusCode: 401);
        }).AllowAnonymous().RequireRateLimiting("login");

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
    }
}
