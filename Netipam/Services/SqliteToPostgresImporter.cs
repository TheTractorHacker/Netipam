using Microsoft.EntityFrameworkCore;
using Netipam.Data;

namespace Netipam.Services;

/// <summary>
/// One-time import of an existing SQLite database into a freshly migrated PostgreSQL database.
/// Runs only when Netipam:ImportFromSqlite points at an existing file and PostgreSQL has no users/settings yet.
/// The source file is renamed to *.migrated afterwards so it never runs twice.
/// </summary>
public static class SqliteToPostgresImporter
{
    private sealed class SingleFactory(DbContextOptions<AppDbContext> options) : IDbContextFactory<AppDbContext>
    {
        public AppDbContext CreateDbContext() => new(options);
    }

    public static async Task<bool> TryImportAsync(
        IServiceProvider services, string? sqlitePath, ILogger logger, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sqlitePath) || !File.Exists(sqlitePath))
            return false;

        var pgFactory = services.GetRequiredService<IDbContextFactory<AppDbContext>>();
        await using (var pg = await pgFactory.CreateDbContextAsync(ct))
        {
            if (await pg.Users.AnyAsync(ct) || await pg.AppSettings.AnyAsync(ct) || await pg.Devices.AnyAsync(ct))
            {
                logger.LogInformation("PostgreSQL already contains data; skipping SQLite import from {Path}.", sqlitePath);
                return false;
            }
        }

        logger.LogInformation("Importing existing SQLite database {Path} into PostgreSQL...", sqlitePath);

        var sqliteOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={sqlitePath}")
            .Options;
        var sqliteFactory = new SingleFactory(sqliteOptions);

        // Bring the source schema up to date, then export it through the provider-neutral JSON backup.
        await using (var src = sqliteFactory.CreateDbContext())
            await src.Database.MigrateAsync(ct);

        var bytes = await new BackupService(sqliteFactory).ExportAsync(ct);

        using var ms = new MemoryStream(bytes);
        await new BackupService(pgFactory).ImportAsync(ms, ct);

        File.Move(sqlitePath, sqlitePath + ".migrated", overwrite: true);
        logger.LogInformation("SQLite import complete. Original file kept as {Path}.migrated", sqlitePath);
        return true;
    }
}
