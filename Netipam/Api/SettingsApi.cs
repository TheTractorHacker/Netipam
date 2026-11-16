using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Netipam.Components.Layout;
using Netipam.Data;
using Netipam.Proxmox;
using Netipam.Services;
using Netipam.Unifi;

namespace Netipam.Api;

/// <summary>Settings area: general/UI, UniFi, Proxmox profiles, backup restore and database reset.</summary>
public sealed class SettingsApi : IApiModule
{
    private const int MinInterval = 30;
    private const int ProxmoxEnableTransitionDelaySeconds = 30;
    private static readonly object ProxmoxTriggerLock = new();
    private static CancellationTokenSource? _proxmoxTriggerCts;

    private static readonly string[] DateFormats =
    {
        "MM-dd-yyyy HH:mm", "yyyy-MM-dd HH:mm", "MM/dd/yyyy h:mm tt", "yyyy-MM-ddTHH:mm:ss"
    };

    public sealed record GeneralRequest(
        string? SiteTitle, string? DateFormat, int UiAutoRefreshSeconds, int SubnetFreeIpDisplayCount,
        int UpdaterLogRetentionHours, bool UiShowWanStatus, string? ThemeName);

    public sealed record UnifiRequest(
        string? BaseUrl, string? SiteName, string? AuthMode, string? Username,
        string? Password, string? ApiKey, bool ClearPassword, bool ClearApiKey,
        bool UpdaterEnabled, int UpdaterIntervalSeconds, int KnownClientCutoffDays,
        bool SyncOnlineStatus, bool SyncName, bool SyncHostname, bool SyncIpAddress,
        bool UpdateConnectionFields, bool SyncManufacturer, bool SyncModel);

    public sealed record ProxmoxRequest(
        string? Name, bool Enabled, string? BaseUrl, string? ApiTokenId, string? ApiTokenSecret, bool ClearSecret,
        int IntervalSeconds, bool UpdateExistingHostAssignments, bool UpdateGuestClientType);

    public sealed record ProxmoxTestRequest(int? Id, string? BaseUrl, string? ApiTokenId, string? ApiTokenSecret);
    public sealed record ConfirmRequest(string? Confirm, string? Password);

    public void Map(RouteGroupBuilder api)
    {
        // Viewers cannot access Settings in the classic UI.
        var g = api.MapGroup("/settings").RequireAuthorization("CanEdit");

        // Display-only values every signed-in user (including Viewers) may read.
        api.MapGet("/settings/public", async (AppSettingsService settings, CancellationToken ct) =>
        {
            var s = await settings.LoadAsync(ct);
            return Results.Ok(new
            {
                siteTitle = string.IsNullOrWhiteSpace(s.SiteTitle) ? "Netipam" : s.SiteTitle,
                dateFormat = s.DateFormat,
            });
        }).RequireAuthorization();

        g.MapGet("", async (AppSettingsService settings, UnifiUpdaterControl updater, CancellationToken ct) =>
        {
            var s = await settings.LoadAsync(ct);
            return Results.Ok(new
            {
                general = new
                {
                    s.SiteTitle, s.DateFormat, s.UiAutoRefreshSeconds, s.SubnetFreeIpDisplayCount,
                    s.UpdaterLogRetentionHours, s.UiShowWanStatus,
                    themeName = MainLayout.NormalizeThemeName(s.ThemeName),
                },
                dateFormats = DateFormats,
                themes = MainLayout.GetThemeOptions().Select(t => new { name = t.Name, displayName = t.DisplayName }),
                unifi = new
                {
                    baseUrl = s.UnifiBaseUrl, siteName = s.UnifiSiteName, authMode = s.UnifiAuthMode,
                    username = s.UnifiUsername,
                    hasPassword = !string.IsNullOrWhiteSpace(s.UnifiPasswordProtected),
                    hasApiKey = !string.IsNullOrWhiteSpace(s.UnifiApiKeyProtected),
                    updaterEnabled = s.UnifiUpdaterEnabled,
                    updaterIntervalSeconds = s.UnifiUpdaterIntervalSeconds,
                    knownClientCutoffDays = s.UnifiKnownClientCutoffDays,
                    syncOnlineStatus = s.UnifiSyncOnlineStatus, syncName = s.UnifiSyncName,
                    syncHostname = s.UnifiSyncHostname, syncIpAddress = s.UnifiSyncIpAddress,
                    updateConnectionFields = s.UnifiUpdateConnectionFieldsWhenOnline,
                    syncManufacturer = s.UnifiSyncManufacturer, syncModel = s.UnifiSyncModel,
                    status = UnifiStatus(updater),
                },
            });
        });

        g.MapPut("/general", async (GeneralRequest r, AppSettingsService settings) =>
        {
            if (r.UiAutoRefreshSeconds < 0 || r.UiAutoRefreshSeconds > 3600)
                return Results.BadRequest(new { error = "Auto-refresh must be 0-3600 seconds." });
            if (r.SubnetFreeIpDisplayCount < 1 || r.SubnetFreeIpDisplayCount > 50)
                return Results.BadRequest(new { error = "Available IPs shown must be 1-50." });
            if (r.UpdaterLogRetentionHours < 1 || r.UpdaterLogRetentionHours > 8760)
                return Results.BadRequest(new { error = "Log retention must be 1-8760 hours." });

            var title = string.IsNullOrWhiteSpace(r.SiteTitle) ? "Netipam" : r.SiteTitle.Trim();
            var date = string.IsNullOrWhiteSpace(r.DateFormat) ? DateFormats[0] : r.DateFormat.Trim();
            var theme = MainLayout.NormalizeThemeName(r.ThemeName);

            await settings.UpdateAsync(s =>
            {
                s.SiteTitle = title;
                s.DateFormat = date;
                s.UiAutoRefreshSeconds = r.UiAutoRefreshSeconds;
                s.SubnetFreeIpDisplayCount = r.SubnetFreeIpDisplayCount;
                s.UpdaterLogRetentionHours = r.UpdaterLogRetentionHours;
                s.UiShowWanStatus = r.UiShowWanStatus;
                s.ThemeName = theme;
            });
            return Results.Ok(new { ok = true });
        });

        g.MapPut("/unifi", async (UnifiRequest r, AppSettingsService settings) =>
        {
            var mode = string.Equals(r.AuthMode?.Trim(), "ApiKey", StringComparison.OrdinalIgnoreCase) ? "ApiKey" : "Session";
            if (r.UpdaterEnabled && (r.UpdaterIntervalSeconds < MinInterval || r.UpdaterIntervalSeconds > 86400))
                return Results.BadRequest(new { error = "Updater interval must be 30-86400 seconds." });
            if (r.KnownClientCutoffDays < 0 || r.KnownClientCutoffDays > 3650)
                return Results.BadRequest(new { error = "Known client cutoff must be 0-3650 days." });

            var interval = r.UpdaterIntervalSeconds <= 0 ? 0 : Math.Clamp(r.UpdaterIntervalSeconds, MinInterval, 86400);

            await settings.UpdateAsync(s =>
            {
                s.UnifiBaseUrl = r.BaseUrl?.Trim();
                s.UnifiSiteName = r.SiteName?.Trim();
                s.UnifiAuthMode = mode;
                s.UnifiUsername = r.Username?.Trim();
                if (r.ClearPassword) s.UnifiPasswordProtected = null;
                else if (!string.IsNullOrWhiteSpace(r.Password)) s.UnifiPasswordProtected = settings.Protect(r.Password);
                if (r.ClearApiKey) s.UnifiApiKeyProtected = null;
                else if (!string.IsNullOrWhiteSpace(r.ApiKey)) s.UnifiApiKeyProtected = settings.Protect(r.ApiKey);

                s.UnifiUpdaterEnabled = r.UpdaterEnabled;
                s.UnifiUpdaterIntervalSeconds = interval;
                s.UnifiKnownClientCutoffDays = r.KnownClientCutoffDays;
                s.UnifiSyncOnlineStatus = r.SyncOnlineStatus;
                s.UnifiSyncName = r.SyncName;
                s.UnifiSyncHostname = r.SyncHostname;
                s.UnifiSyncIpAddress = r.SyncIpAddress;
                s.UnifiUpdateConnectionFieldsWhenOnline = r.UpdateConnectionFields;
                s.UnifiSyncManufacturer = r.SyncManufacturer;
                s.UnifiSyncModel = r.SyncModel;
            });
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/unifi/test", async (UnifiApiClient client, AppSettingsService settings) =>
        {
            try
            {
                using var doc = await client.GetActiveClientsAsync();
                var s = await settings.LoadAsync();
                return Results.Ok(new { ok = true, message = "UniFi responded successfully.", at = DateTime.UtcNow.ToString("o"), s.DateFormat });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { ok = false, message = ex.Message });
            }
        });

        g.MapPost("/unifi/run", (UnifiUpdaterControl updater) =>
        {
            updater.TriggerNow();
            return Results.Ok(new { ok = true });
        });

        g.MapGet("/unifi/status", (UnifiUpdaterControl updater) => Results.Ok(UnifiStatus(updater)));

        // ---------------- Proxmox ----------------
        g.MapGet("/proxmox", async (AppDbContext db, CancellationToken ct) =>
        {
            await EnsureProxmoxClientTypesAsync(db, ct);
            var list = await db.ProxmoxInstances.AsNoTracking().OrderBy(p => p.Name).ToListAsync(ct);
            return Results.Ok(list.Select(ProxmoxDto));
        });

        g.MapPost("/proxmox", async (ProxmoxRequest r, AppDbContext db, AppSettingsService settings, ProxmoxUpdaterControl px, CancellationToken ct) =>
        {
            var err = ValidateProxmox(r, isNew: true, existingHasSecret: false);
            if (err is not null) return Results.BadRequest(new { error = err });

            var e = new ProxmoxInstance();
            ApplyProxmox(e, r, settings);
            db.ProxmoxInstances.Add(e);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) { return Results.BadRequest(new { error = $"Unable to save Proxmox profile: {ex.GetBaseException().Message}" }); }

            var scheduled = false;
            if (e.Enabled) { ScheduleProxmoxTrigger(px); scheduled = true; }
            return Results.Ok(new { profile = ProxmoxDto(e), updaterScheduled = scheduled, delaySeconds = ProxmoxEnableTransitionDelaySeconds });
        });

        g.MapPut("/proxmox/{id:int}", async (int id, ProxmoxRequest r, AppDbContext db, AppSettingsService settings, ProxmoxUpdaterControl px, CancellationToken ct) =>
        {
            var e = await db.ProxmoxInstances.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Profile not found." });

            var err = ValidateProxmox(r, isNew: false, existingHasSecret: !string.IsNullOrWhiteSpace(e.ApiTokenSecretProtected));
            if (err is not null) return Results.BadRequest(new { error = err });

            var wasEnabled = e.Enabled;
            ApplyProxmox(e, r, settings);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) { return Results.BadRequest(new { error = $"Unable to save Proxmox profile: {ex.GetBaseException().Message}" }); }

            var scheduled = false;
            if (e.Enabled && !wasEnabled) { ScheduleProxmoxTrigger(px); scheduled = true; }
            return Results.Ok(new { profile = ProxmoxDto(e), updaterScheduled = scheduled, delaySeconds = ProxmoxEnableTransitionDelaySeconds });
        });

        g.MapDelete("/proxmox/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var e = await db.ProxmoxInstances.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (e is null) return Results.NotFound(new { error = "Profile not found." });
            db.ProxmoxInstances.Remove(e);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/proxmox/test", async (ProxmoxTestRequest r, AppDbContext db, AppSettingsService settings, ProxmoxApiClient client) =>
        {
            try
            {
                var baseUrl = r.BaseUrl?.Trim() ?? "";
                var tokenId = r.ApiTokenId?.Trim() ?? "";
                var secret = r.ApiTokenSecret;
                if (string.IsNullOrWhiteSpace(secret) && r.Id is int id)
                {
                    var protectedSecret = await db.ProxmoxInstances.AsNoTracking()
                        .Where(p => p.Id == id).Select(p => p.ApiTokenSecretProtected).FirstOrDefaultAsync();
                    secret = settings.Unprotect(protectedSecret);
                }

                using var doc = await client.GetVmResourcesAsync(baseUrl, tokenId, secret ?? "");
                var count = 0;
                if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                    doc.RootElement.TryGetProperty("data", out var data) &&
                    data.ValueKind == JsonValueKind.Array)
                    count = data.GetArrayLength();

                return Results.Ok(new { ok = true, message = $"Proxmox responded with {count} VM/CT resource rows.", count });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { ok = false, message = ex.Message });
            }
        });

        g.MapPost("/proxmox/run", (ProxmoxUpdaterControl px) =>
        {
            px.TriggerNow();
            return Results.Ok(new { ok = true });
        });

        // ---------------- Danger zone / restore (admin) ----------------
        g.MapPost("/restore", async (HttpRequest request, BackupService backup, UserManager<ApplicationUser> users, HttpContext http, CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
                return Results.BadRequest(new { error = "Invalid content type." });
            const long maxBytes = 200L * 1024L * 1024L;
            IFormCollection form;
            try
            {
                var feature = new Microsoft.AspNetCore.Http.Features.FormFeature(request, new Microsoft.AspNetCore.Http.Features.FormOptions
                {
                    MultipartBodyLengthLimit = maxBytes + 1024 * 1024,
                    ValueLengthLimit = 1024 * 1024,
                });
                form = await feature.ReadFormAsync(ct);
            }
            catch (Exception ex) when (ex is InvalidDataException or Microsoft.AspNetCore.Http.BadHttpRequestException)
            {
                return Results.Json(new { error = "Backup file is too large (max 200 MB)." }, statusCode: 413);
            }
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "Backup file is missing." });
            if (file.Length > 1024L * 1024L * 200L)
                return Results.BadRequest(new { error = "Backup file is too large." });
            if (!string.Equals(form["confirm"].ToString().Trim(), "IMPORT", StringComparison.Ordinal))
                return Results.BadRequest(new { error = "Type IMPORT to confirm." });

            var pw = await VerifyPasswordAsync(users, http, form["password"].ToString());
            if (pw is not null) return pw;

            try
            {
                await using var stream = file.OpenReadStream();
                var deleted = await backup.ImportAsync(stream, ct);
                return Results.Ok(new { deleted });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Import failed: {ex.Message}" });
            }
        }).RequireAuthorization("AdminOnly").DisableAntiforgery()
          .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(210L * 1024L * 1024L));

        g.MapPost("/reset", async (ConfirmRequest r, DatabaseResetService reset, UserManager<ApplicationUser> users, HttpContext http, CancellationToken ct) =>
        {
            if (!string.Equals(r.Confirm?.Trim(), "RESET", StringComparison.Ordinal))
                return Results.BadRequest(new { error = "Type RESET to confirm." });
            var pw = await VerifyPasswordAsync(users, http, r.Password);
            if (pw is not null) return pw;

            var deleted = await reset.ResetImportedDataAsync(ct);
            return Results.Ok(new { ok = true, deleted });
        }).RequireAuthorization("AdminOnly");
    }

    private static async Task<IResult?> VerifyPasswordAsync(UserManager<ApplicationUser> users, HttpContext http, string? password)
    {
        if (string.IsNullOrWhiteSpace(password))
            return Results.BadRequest(new { error = "Current password is required." });
        var user = await users.GetUserAsync(http.User);
        if (user is null)
            return Results.BadRequest(new { error = "Unable to verify user." });
        if (!await users.CheckPasswordAsync(user, password))
            return Results.BadRequest(new { error = "Password verification failed." });
        return null;
    }

    private static object UnifiStatus(UnifiUpdaterControl u) => new
    {
        lastRunUtc = u.LastRunUtc is { } t ? DateTime.SpecifyKind(t, DateTimeKind.Utc).ToString("o") : null,
        lastChangedCount = u.LastChangedCount,
        lastError = string.IsNullOrWhiteSpace(u.LastError) ? null : u.LastError,
    };

    private static object ProxmoxDto(ProxmoxInstance p) => new
    {
        p.Id, p.Name, p.Enabled, p.BaseUrl, p.ApiTokenId,
        hasToken = !string.IsNullOrWhiteSpace(p.ApiTokenSecretProtected),
        p.IntervalSeconds, p.UpdateExistingHostAssignments, p.UpdateGuestClientType,
    };

    private static string? ValidateProxmox(ProxmoxRequest r, bool isNew, bool existingHasSecret)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Proxmox profile name is required.";
        if (string.IsNullOrWhiteSpace(r.BaseUrl)) return "Proxmox URL is required.";
        if (string.IsNullOrWhiteSpace(r.ApiTokenId)) return "Proxmox API token ID is required.";
        if (isNew && string.IsNullOrWhiteSpace(r.ApiTokenSecret))
            return "Proxmox API token secret is required for new profiles.";
        _ = existingHasSecret;
        return null;
    }

    private static void ApplyProxmox(ProxmoxInstance e, ProxmoxRequest r, AppSettingsService settings)
    {
        e.Name = r.Name!.Trim();
        e.Enabled = r.Enabled;
        e.BaseUrl = r.BaseUrl!.Trim();
        e.ApiTokenId = r.ApiTokenId!.Trim();
        e.IntervalSeconds = r.IntervalSeconds <= 0 ? 300 : Math.Clamp(r.IntervalSeconds, 30, 86400);
        e.UpdateExistingHostAssignments = r.UpdateExistingHostAssignments;
        e.UpdateGuestClientType = r.UpdateGuestClientType;
        if (r.ClearSecret && string.IsNullOrWhiteSpace(r.ApiTokenSecret)) e.ApiTokenSecretProtected = null;
        else if (!string.IsNullOrWhiteSpace(r.ApiTokenSecret)) e.ApiTokenSecretProtected = settings.Protect(r.ApiTokenSecret);
    }

    /// <summary>Delayed trigger after enabling/creating a profile; a newer save supersedes it.</summary>
    private static void ScheduleProxmoxTrigger(ProxmoxUpdaterControl px)
    {
        CancellationTokenSource cts;
        lock (ProxmoxTriggerLock)
        {
            _proxmoxTriggerCts?.Cancel();
            _proxmoxTriggerCts?.Dispose();
            _proxmoxTriggerCts = new CancellationTokenSource();
            cts = _proxmoxTriggerCts;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(ProxmoxEnableTransitionDelaySeconds), cts.Token);
                if (!cts.Token.IsCancellationRequested) px.TriggerNow();
            }
            catch (OperationCanceledException) { }
        });
    }

    private static async Task EnsureProxmoxClientTypesAsync(AppDbContext db, CancellationToken ct)
    {
        var existing = await db.ClientTypes.ToListAsync(ct);
        var byName = existing.ToDictionary(t => t.Name.Trim(), t => t, StringComparer.OrdinalIgnoreCase);
        var changed = false;

        if (!byName.TryGetValue("Proxmox Server", out var server))
        {
            db.ClientTypes.Add(new ClientType { Name = "Proxmox Server", IsDevice = true, IsHost = true });
            changed = true;
        }
        else
        {
            if (!server.IsDevice) { server.IsDevice = true; changed = true; }
            if (!server.IsHost) { server.IsHost = true; changed = true; }
        }
        if (!byName.ContainsKey("Proxmox VM")) { db.ClientTypes.Add(new ClientType { Name = "Proxmox VM", IsDevice = false, IsHost = false }); changed = true; }
        if (!byName.ContainsKey("Proxmox LXC")) { db.ClientTypes.Add(new ClientType { Name = "Proxmox LXC", IsDevice = false, IsHost = false }); changed = true; }

        if (changed) await db.SaveChangesAsync(ct);
    }
}
