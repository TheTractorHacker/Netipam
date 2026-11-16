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
    }
}
