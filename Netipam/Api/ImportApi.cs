using Netipam.Services;
using Netipam.Unifi;
using Netipam.Data;

namespace Netipam.Api;

/// <summary>UniFi import (port of UnifiImport.razor). Viewers could not use the classic page, so everything needs CanEdit.</summary>
public sealed class ImportApi : IApiModule
{
    public sealed record SubnetsBody(List<SubnetImportRow>? Rows);
    public sealed record ClientsBody(List<ClientImportRow>? Rows);
    public sealed record InfraBody(List<InfraImportRow>? Rows);
    public sealed record UpdatesBody(List<ClientUpdateImportRow>? Rows);

    private static UnifiImportService Svc(AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c)
        => new(db, s, u, c);

    private static string Root(Exception ex)
    {
        var e = ex;
        while (e.InnerException != null) e = e.InnerException;
        return e.Message;
    }

    private static async Task<IResult> Run(Func<Task<IResult>> action, string prefix)
    {
        try { return await action(); }
        catch (OperationCanceledException) { return Results.StatusCode(499); }
        catch (Exception ex) { return Results.BadRequest(new { error = $"{prefix}: {Root(ex)}" }); }
    }

    public void Map(RouteGroupBuilder api)
    {
        var g = api.MapGroup("/import/unifi").RequireAuthorization("CanEdit");

        g.MapPost("/test", (AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () =>
            {
                await Svc(db, s, u, c).TestConnectAsync(ct);
                return Results.Ok(new { ok = true, message = "Login OK." });
            }, "Connection error"));

        g.MapPost("/subnets/preview", (AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).PreviewSubnetsAsync(ct)), "Error loading subnets"));

        g.MapPost("/subnets/commit", (SubnetsBody body, AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).CommitSubnetsAsync(body.Rows ?? new(), ct)), "Commit error"));

        g.MapPost("/devices/preview", (AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).PreviewInfraAsync(ct)), "Error loading UniFi devices"));

        g.MapPost("/devices/commit", (InfraBody body, AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).CommitInfraAsync(body.Rows ?? new(), ct)), "Commit error"));

        g.MapPost("/clients/preview", (AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).PreviewClientsAsync(ct)), "Error loading clients"));

        g.MapPost("/clients/commit", (ClientsBody body, AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).CommitClientsAsync(body.Rows ?? new(), ct)), "Commit error"));

        g.MapPost("/updates/preview", (AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).PreviewClientUpdatesAsync(ct)), "Error loading update preview"));

        g.MapPost("/updates/commit", (UpdatesBody body, AppDbContext db, AppSettingsService s, UnifiApiClient u, UnifiUpdaterControl c, CancellationToken ct) =>
            Run(async () => Results.Ok(await Svc(db, s, u, c).CommitClientUpdatesAsync(body.Rows ?? new(), ct)), "Commit error"));
    }
}
