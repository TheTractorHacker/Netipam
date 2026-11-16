using System.Reflection;

namespace Netipam.Api;

/// <summary>
/// One area of the JSON API. Implement this in Api/&lt;Area&gt;Api.cs with a public parameterless
/// constructor; it is discovered and mapped automatically under /api. Mutating endpoints must call
/// .RequireAuthorization("CanEdit") (or "AdminOnly"). Reads are open to any signed-in user.
/// </summary>
public interface IApiModule
{
    void Map(RouteGroupBuilder api);
}

public static class ApiModules
{
    public static void MapNetipamApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        var modules = typeof(IApiModule).Assembly.GetTypes()
            .Where(t => typeof(IApiModule).IsAssignableFrom(t) && t is { IsAbstract: false, IsInterface: false })
            .OrderBy(t => t.FullName, StringComparer.Ordinal);

        foreach (var type in modules)
            ((IApiModule)Activator.CreateInstance(type)!).Map(api);

        api.MapFallback("/{**rest}", () => Results.NotFound(new { error = "Not found" })).AllowAnonymous();
    }
}
