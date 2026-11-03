using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Netipam.Postgres.Migrations
{
    /// <inheritdoc />
    public partial class InitialPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccessCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccessCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AppSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UnifiUpdaterEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UnifiUpdaterIntervalSeconds = table.Column<int>(type: "integer", nullable: false, defaultValue: 120),
                    UnifiUpdateConnectionFieldsWhenOnline = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UnifiSyncIpAddress = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UnifiSyncOnlineStatus = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UnifiSyncName = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UnifiSyncHostname = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UnifiSyncManufacturer = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UnifiSyncModel = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UnifiKnownClientCutoffDays = table.Column<int>(type: "integer", nullable: false, defaultValue: 60),
                    UnifiBaseUrl = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    UnifiSiteName = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UnifiUsername = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    UnifiPasswordProtected = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    UnifiAuthMode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "Session"),
                    UnifiApiKeyProtected = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    ProxmoxEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ProxmoxBaseUrl = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ProxmoxApiTokenId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ProxmoxApiTokenSecretProtected = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    ProxmoxHostDeviceMac = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ProxmoxIntervalSeconds = table.Column<int>(type: "integer", nullable: false, defaultValue: 300),
                    ProxmoxUpdateExistingHostAssignments = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    ShowLastSeenTooltips = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UiAutoRefreshSeconds = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    DarkMode = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    ThemeName = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false, defaultValue: "Graphite"),
                    UiShowWanStatus = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    SiteTitle = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false, defaultValue: "Netipam"),
                    DateFormat = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false, defaultValue: "MM-dd-yyyy HH:mm")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AspNetRoles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUsers",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    UserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedUserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    EmailConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: true),
                    SecurityStamp = table.Column<string>(type: "text", nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PhoneNumberConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    TwoFactorEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LockoutEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LockoutEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AccessFailedCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUsers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClientDiscoveryAlerts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Mac = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Hostname = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ConnectionType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UpstreamDeviceName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    UpstreamDeviceMac = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UpstreamConnection = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ConnectionDetail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsOnline = table.Column<bool>(type: "boolean", nullable: false),
                    DetectedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    AcknowledgedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientDiscoveryAlerts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClientTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Icon = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    IsDevice = table.Column<bool>(type: "boolean", nullable: false),
                    IsHost = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IgnoredDiscoveryMacs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Mac = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IgnoredAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IgnoredDiscoveryMacs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Locations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProxmoxInstances",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    BaseUrl = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ApiTokenId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ApiTokenSecretProtected = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    IntervalSeconds = table.Column<int>(type: "integer", nullable: false, defaultValue: 300),
                    UpdateExistingHostAssignments = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UpdateGuestClientType = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProxmoxInstances", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Subnets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Cidr = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    DhcpRangeStart = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DhcpRangeEnd = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    VlanId = table.Column<int>(type: "integer", nullable: true),
                    Dns1 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Dns2 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Subnets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UpdaterRunLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    FinishedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    DurationMs = table.Column<int>(type: "integer", nullable: true),
                    ChangedCount = table.Column<int>(type: "integer", nullable: false),
                    Error = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UpdaterRunLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserColumnPreferences",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    PageKey = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ColumnKey = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsVisible = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserColumnPreferences", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WanInterfaceStatuses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GatewayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    GatewayMac = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    InterfaceName = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsUp = table.Column<bool>(type: "boolean", nullable: true),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WanInterfaceStatuses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserAccessCategoryOrders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    AccessCategoryId = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAccessCategoryOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserAccessCategoryOrders_AccessCategories_AccessCategoryId",
                        column: x => x.AccessCategoryId,
                        principalTable: "AccessCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetRoleClaims",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoleId = table.Column<string>(type: "text", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetRoleClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetRoleClaims_AspNetRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "AspNetRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserClaims",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetUserClaims_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserLogins",
                columns: table => new
                {
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    ProviderKey = table.Column<string>(type: "text", nullable: false),
                    ProviderDisplayName = table.Column<string>(type: "text", nullable: true),
                    UserId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserLogins", x => new { x.LoginProvider, x.ProviderKey });
                    table.ForeignKey(
                        name: "FK_AspNetUserLogins_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserRoles",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "text", nullable: false),
                    RoleId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserRoles", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_AspNetUserRoles_AspNetRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "AspNetRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AspNetUserRoles_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserTokens",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "text", nullable: false),
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserTokens", x => new { x.UserId, x.LoginProvider, x.Name });
                    table.ForeignKey(
                        name: "FK_AspNetUserTokens_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Racks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LocationId = table.Column<int>(type: "integer", nullable: true),
                    RackUnits = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Racks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Racks_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "UpdaterChangeLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RunId = table.Column<int>(type: "integer", nullable: false),
                    DeviceId = table.Column<int>(type: "integer", nullable: true),
                    DeviceName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    FieldName = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    OldValue = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    NewValue = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UpdaterChangeLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UpdaterChangeLogs_UpdaterRunLogs_RunId",
                        column: x => x.RunId,
                        principalTable: "UpdaterRunLogs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Devices",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Hostname = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    MacAddress = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    AccessLink = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    AccessCategoryId = table.Column<int>(type: "integer", nullable: true),
                    LocationId = table.Column<int>(type: "integer", nullable: true),
                    RackId = table.Column<int>(type: "integer", nullable: true),
                    RackUPosition = table.Column<int>(type: "integer", nullable: true),
                    RackUSize = table.Column<int>(type: "integer", nullable: true),
                    SubnetId = table.Column<int>(type: "integer", nullable: true),
                    UpstreamDeviceName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    UpstreamDeviceMac = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UpstreamConnection = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ParentDeviceId = table.Column<int>(type: "integer", nullable: true),
                    ManualUpstreamDeviceId = table.Column<int>(type: "integer", nullable: true),
                    IsTopologyRoot = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ConnectionType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ConnectionDetail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ClientTypeId = table.Column<int>(type: "integer", nullable: true),
                    HostDeviceId = table.Column<int>(type: "integer", nullable: true),
                    IsProxmoxHost = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ProxmoxInstanceId = table.Column<int>(type: "integer", nullable: true),
                    ProxmoxNodeIdentifier = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Manufacturer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Model = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    OperatingSystem = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Usage = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    AssetNumber = table.Column<string>(type: "text", nullable: true),
                    Location = table.Column<string>(type: "text", nullable: true),
                    Source = table.Column<string>(type: "text", nullable: true),
                    UsedNew = table.Column<string>(type: "text", nullable: true),
                    SourceDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsOnline = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsStatusTracked = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    IsCritical = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    MonitorMode = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    MonitorPort = table.Column<int>(type: "integer", nullable: true),
                    MonitorUseHttps = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    MonitorHttpPath = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    LastSeenAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    LastOnlineAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    LastStatusRollupAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    IgnoreOffline = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Devices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Devices_AccessCategories_AccessCategoryId",
                        column: x => x.AccessCategoryId,
                        principalTable: "AccessCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_ClientTypes_ClientTypeId",
                        column: x => x.ClientTypeId,
                        principalTable: "ClientTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_Devices_HostDeviceId",
                        column: x => x.HostDeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_Devices_ManualUpstreamDeviceId",
                        column: x => x.ManualUpstreamDeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_Devices_ParentDeviceId",
                        column: x => x.ParentDeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_ProxmoxInstances_ProxmoxInstanceId",
                        column: x => x.ProxmoxInstanceId,
                        principalTable: "ProxmoxInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_Racks_RackId",
                        column: x => x.RackId,
                        principalTable: "Racks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Devices_Subnets_SubnetId",
                        column: x => x.SubnetId,
                        principalTable: "Subnets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ClientOfflineAlerts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DeviceId = table.Column<int>(type: "integer", nullable: false),
                    NameAtTime = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IpAtTime = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    WentOfflineAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    CameOnlineAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    AcknowledgedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientOfflineAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClientOfflineAlerts_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DeviceFirmwareUpdateAlerts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DeviceId = table.Column<int>(type: "integer", nullable: false),
                    NameAtTime = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    MacAtTime = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ModelAtTime = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CurrentVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    TargetVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DetectedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    AcknowledgedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    ResolvedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceFirmwareUpdateAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeviceFirmwareUpdateAlerts_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DeviceIpHistories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DeviceId = table.Column<int>(type: "integer", nullable: false),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Port = table.Column<int>(type: "integer", nullable: true),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    FirstSeenUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    LastSeenUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceIpHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeviceIpHistories_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DeviceStatusDaily",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DeviceId = table.Column<int>(type: "integer", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    OnlineSeconds = table.Column<int>(type: "integer", nullable: false),
                    ObservedSeconds = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceStatusDaily", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeviceStatusDaily_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DeviceStatusEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DeviceId = table.Column<int>(type: "integer", nullable: false),
                    IsOnline = table.Column<bool>(type: "boolean", nullable: false),
                    ChangedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceStatusEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeviceStatusEvents_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IpAssignments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SubnetId = table.Column<int>(type: "integer", nullable: false),
                    DeviceId = table.Column<int>(type: "integer", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IpAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IpAssignments_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_IpAssignments_Subnets_SubnetId",
                        column: x => x.SubnetId,
                        principalTable: "Subnets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserAccessItemOrders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    DeviceId = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAccessItemOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserAccessItemOrders_Devices_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "Devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccessCategories_Name",
                table: "AccessCategories",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetRoleClaims_RoleId",
                table: "AspNetRoleClaims",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "RoleNameIndex",
                table: "AspNetRoles",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserClaims_UserId",
                table: "AspNetUserClaims",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserLogins_UserId",
                table: "AspNetUserLogins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserRoles_RoleId",
                table: "AspNetUserRoles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "EmailIndex",
                table: "AspNetUsers",
                column: "NormalizedEmail");

            migrationBuilder.CreateIndex(
                name: "UserNameIndex",
                table: "AspNetUsers",
                column: "NormalizedUserName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ClientDiscoveryAlerts_DetectedAtUtc",
                table: "ClientDiscoveryAlerts",
                column: "DetectedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ClientDiscoveryAlerts_IsAcknowledged",
                table: "ClientDiscoveryAlerts",
                column: "IsAcknowledged");

            migrationBuilder.CreateIndex(
                name: "IX_ClientDiscoveryAlerts_Mac",
                table: "ClientDiscoveryAlerts",
                column: "Mac");

            migrationBuilder.CreateIndex(
                name: "IX_ClientOfflineAlerts_DeviceId",
                table: "ClientOfflineAlerts",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_ClientOfflineAlerts_IsAcknowledged",
                table: "ClientOfflineAlerts",
                column: "IsAcknowledged");

            migrationBuilder.CreateIndex(
                name: "IX_ClientOfflineAlerts_WentOfflineAtUtc",
                table: "ClientOfflineAlerts",
                column: "WentOfflineAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ClientTypes_Name",
                table: "ClientTypes",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeviceFirmwareUpdateAlerts_DetectedAtUtc",
                table: "DeviceFirmwareUpdateAlerts",
                column: "DetectedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceFirmwareUpdateAlerts_DeviceId",
                table: "DeviceFirmwareUpdateAlerts",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceFirmwareUpdateAlerts_IsAcknowledged",
                table: "DeviceFirmwareUpdateAlerts",
                column: "IsAcknowledged");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceFirmwareUpdateAlerts_ResolvedAtUtc",
                table: "DeviceFirmwareUpdateAlerts",
                column: "ResolvedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceIpHistories_DeviceId",
                table: "DeviceIpHistories",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceIpHistories_DeviceId_IpAddress",
                table: "DeviceIpHistories",
                columns: new[] { "DeviceId", "IpAddress" });

            migrationBuilder.CreateIndex(
                name: "IX_Devices_AccessCategoryId",
                table: "Devices",
                column: "AccessCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_ClientTypeId",
                table: "Devices",
                column: "ClientTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_HostDeviceId",
                table: "Devices",
                column: "HostDeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_LocationId",
                table: "Devices",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_MacAddress",
                table: "Devices",
                column: "MacAddress",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Devices_ManualUpstreamDeviceId",
                table: "Devices",
                column: "ManualUpstreamDeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_ParentDeviceId",
                table: "Devices",
                column: "ParentDeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_ProxmoxInstanceId",
                table: "Devices",
                column: "ProxmoxInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_ProxmoxNodeIdentifier",
                table: "Devices",
                column: "ProxmoxNodeIdentifier");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_RackId",
                table: "Devices",
                column: "RackId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_SubnetId",
                table: "Devices",
                column: "SubnetId");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceStatusDaily_Date",
                table: "DeviceStatusDaily",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceStatusDaily_DeviceId_Date",
                table: "DeviceStatusDaily",
                columns: new[] { "DeviceId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeviceStatusEvents_ChangedAtUtc",
                table: "DeviceStatusEvents",
                column: "ChangedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceStatusEvents_DeviceId",
                table: "DeviceStatusEvents",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_IgnoredDiscoveryMacs_Mac",
                table: "IgnoredDiscoveryMacs",
                column: "Mac",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IpAssignments_DeviceId",
                table: "IpAssignments",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_IpAssignments_SubnetId_IpAddress",
                table: "IpAssignments",
                columns: new[] { "SubnetId", "IpAddress" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Locations_Name",
                table: "Locations",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProxmoxInstances_Name",
                table: "ProxmoxInstances",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Racks_LocationId",
                table: "Racks",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Racks_Name",
                table: "Racks",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Subnets_Cidr",
                table: "Subnets",
                column: "Cidr",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UpdaterChangeLogs_DeviceId",
                table: "UpdaterChangeLogs",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_UpdaterChangeLogs_RunId",
                table: "UpdaterChangeLogs",
                column: "RunId");

            migrationBuilder.CreateIndex(
                name: "IX_UpdaterRunLogs_StartedAtUtc",
                table: "UpdaterRunLogs",
                column: "StartedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_UserAccessCategoryOrders_AccessCategoryId",
                table: "UserAccessCategoryOrders",
                column: "AccessCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAccessCategoryOrders_UserId",
                table: "UserAccessCategoryOrders",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAccessCategoryOrders_UserId_AccessCategoryId",
                table: "UserAccessCategoryOrders",
                columns: new[] { "UserId", "AccessCategoryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserAccessItemOrders_DeviceId",
                table: "UserAccessItemOrders",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAccessItemOrders_UserId",
                table: "UserAccessItemOrders",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAccessItemOrders_UserId_DeviceId",
                table: "UserAccessItemOrders",
                columns: new[] { "UserId", "DeviceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserColumnPreferences_UserId_PageKey",
                table: "UserColumnPreferences",
                columns: new[] { "UserId", "PageKey" });

            migrationBuilder.CreateIndex(
                name: "IX_UserColumnPreferences_UserId_PageKey_ColumnKey",
                table: "UserColumnPreferences",
                columns: new[] { "UserId", "PageKey", "ColumnKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WanInterfaceStatuses_GatewayMac",
                table: "WanInterfaceStatuses",
                column: "GatewayMac");

            migrationBuilder.CreateIndex(
                name: "IX_WanInterfaceStatuses_InterfaceName",
                table: "WanInterfaceStatuses",
                column: "InterfaceName");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropTable(
                name: "AspNetRoleClaims");

            migrationBuilder.DropTable(
                name: "AspNetUserClaims");

            migrationBuilder.DropTable(
                name: "AspNetUserLogins");

            migrationBuilder.DropTable(
                name: "AspNetUserRoles");

            migrationBuilder.DropTable(
                name: "AspNetUserTokens");

            migrationBuilder.DropTable(
                name: "ClientDiscoveryAlerts");

            migrationBuilder.DropTable(
                name: "ClientOfflineAlerts");

            migrationBuilder.DropTable(
                name: "DeviceFirmwareUpdateAlerts");

            migrationBuilder.DropTable(
                name: "DeviceIpHistories");

            migrationBuilder.DropTable(
                name: "DeviceStatusDaily");

            migrationBuilder.DropTable(
                name: "DeviceStatusEvents");

            migrationBuilder.DropTable(
                name: "IgnoredDiscoveryMacs");

            migrationBuilder.DropTable(
                name: "IpAssignments");

            migrationBuilder.DropTable(
                name: "UpdaterChangeLogs");

            migrationBuilder.DropTable(
                name: "UserAccessCategoryOrders");

            migrationBuilder.DropTable(
                name: "UserAccessItemOrders");

            migrationBuilder.DropTable(
                name: "UserColumnPreferences");

            migrationBuilder.DropTable(
                name: "WanInterfaceStatuses");

            migrationBuilder.DropTable(
                name: "AspNetRoles");

            migrationBuilder.DropTable(
                name: "AspNetUsers");

            migrationBuilder.DropTable(
                name: "UpdaterRunLogs");

            migrationBuilder.DropTable(
                name: "Devices");

            migrationBuilder.DropTable(
                name: "AccessCategories");

            migrationBuilder.DropTable(
                name: "ClientTypes");

            migrationBuilder.DropTable(
                name: "ProxmoxInstances");

            migrationBuilder.DropTable(
                name: "Racks");

            migrationBuilder.DropTable(
                name: "Subnets");

            migrationBuilder.DropTable(
                name: "Locations");
        }
    }
}
