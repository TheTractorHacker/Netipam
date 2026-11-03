using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Netipam.Data;

namespace Netipam.Postgres;

// Used only by `dotnet ef migrations ...` to scaffold PostgreSQL migrations.
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

        var cs = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
                 ?? "Host=localhost;Database=netipam;Username=netipam;Password=netipam";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(cs, o => o.MigrationsAssembly("Netipam.Postgres"))
            .Options;

        return new AppDbContext(options);
    }
}
