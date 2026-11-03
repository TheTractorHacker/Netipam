using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Netipam.Migrations
{
    /// <inheritdoc />
    public partial class AddSubnetFreeIpAndLogRetention : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SubnetFreeIpDisplayCount",
                table: "AppSettings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 3);

            migrationBuilder.AddColumn<int>(
                name: "UpdaterLogRetentionHours",
                table: "AppSettings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 24);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SubnetFreeIpDisplayCount",
                table: "AppSettings");

            migrationBuilder.DropColumn(
                name: "UpdaterLogRetentionHours",
                table: "AppSettings");
        }
    }
}
