using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Netipam.Data;
using Netipam.Services;

namespace Netipam.Api;

public sealed class HistoryApi : IApiModule
{
    private sealed record Segment(int Start, int Minutes, string Kind);
    private sealed record EventPoint(DateTime Local, bool IsOnline);

    private static string ServerZone => TimeZoneInfo.Local.Id;

    private static string Iso(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToString("o");

    public void Map(RouteGroupBuilder api)
    {
        api.MapGet("/devices/{id:int}/history", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var device = await db.Devices.AsNoTracking()
                .Where(d => d.Id == id)
                .Select(d => new
                {
                    d.Id,
                    d.Name,
                    d.IsStatusTracked,
                    d.IsOnline,
                    clientType = d.ClientType != null ? d.ClientType.Name : null,
                    isDevice = d.ClientType != null && d.ClientType.IsDevice
                })
                .FirstOrDefaultAsync(ct);
            if (device is null)
                return Results.NotFound(new { error = "Device not found." });

            var today = DateOnly.FromDateTime(DateTime.Now);
            var startDate = today.AddDays(-29);

            var rollups = await db.DeviceStatusDaily.AsNoTracking()
                .Where(r => r.DeviceId == id && r.Date >= startDate && r.Date <= today)
                .OrderBy(r => r.Date)
                .ToListAsync(ct);

            var daily = rollups.Select(r =>
            {
                var observed = Math.Max(r.ObservedSeconds, r.OnlineSeconds);
                return new
                {
                    date = r.Date.ToString("yyyy-MM-dd"),
                    onlineSeconds = r.OnlineSeconds,
                    offlineSeconds = Math.Max(0, observed - r.OnlineSeconds),
                    observedSeconds = observed,
                    percent = observed <= 0 ? 0 : Math.Min(100, r.OnlineSeconds * 100.0 / observed)
                };
            }).ToList();

            var tz = TimeZoneInfo.Local;
            var tlStartUtc = TimeZoneInfo.ConvertTimeToUtc(startDate.ToDateTime(TimeOnly.MinValue), tz).AddDays(-1);
            var tlEndUtc = TimeZoneInfo.ConvertTimeToUtc(today.AddDays(1).ToDateTime(TimeOnly.MinValue), tz);

            var timelineEvents = await db.DeviceStatusEvents.AsNoTracking()
                .Where(e => e.DeviceId == id && e.ChangedAtUtc >= tlStartUtc && e.ChangedAtUtc < tlEndUtc)
                .OrderBy(e => e.ChangedAtUtc)
                .ToListAsync(ct);

            bool? defaultStatus = device.IsStatusTracked ? device.IsOnline : null;
            var timelines = BuildDayTimelines(startDate, today, timelineEvents, defaultStatus);

            var cutoff = DateTime.UtcNow.AddDays(-30);
            var events = await db.DeviceStatusEvents.AsNoTracking()
                .Where(e => e.DeviceId == id && e.ChangedAtUtc >= cutoff)
                .OrderByDescending(e => e.ChangedAtUtc)
                .ToListAsync(ct);

            var ips = await db.DeviceIpHistories.AsNoTracking()
                .Where(h => h.DeviceId == id)
                .OrderByDescending(h => h.FirstSeenUtc)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                timeZone = ServerZone,
                device = new { device.Id, device.Name, device.clientType, device.isDevice },
                daily,
                timelines = timelines.ToDictionary(k => k.Key.ToString("yyyy-MM-dd"), v => v.Value),
                events = events.Select(e => new { e.Id, isOnline = e.IsOnline, at = Iso(e.ChangedAtUtc), e.Source }),
                ips = ips.Select(h => new
                {
                    h.Id,
                    ip = h.IpAddress,
                    h.Port,
                    h.Source,
                    firstSeen = Iso(h.FirstSeenUtc),
                    lastSeen = h.LastSeenUtc.HasValue ? Iso(h.LastSeenUtc.Value) : null
                })
            });
        });

        api.MapGet("/history/logs", async (AppDbContext db, AppSettingsService settings, CancellationToken ct) =>
        {
            var retentionHours = Math.Max(1, (await settings.LoadAsync(ct)).UpdaterLogRetentionHours);
            var cutoff = DateTime.UtcNow.AddHours(-retentionHours);
            var runs = await db.UpdaterRunLogs.AsNoTracking()
                .Include(r => r.Changes)
                .Where(r => r.StartedAtUtc >= cutoff)
                .OrderByDescending(r => r.StartedAtUtc)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                retentionHours,
                timeZone = ServerZone,
                runs = runs.Select(r => new
                {
                    r.Id,
                    startedAt = Iso(r.StartedAtUtc),
                    finishedAt = r.FinishedAtUtc.HasValue ? Iso(r.FinishedAtUtc.Value) : null,
                    r.DurationMs,
                    r.ChangedCount,
                    r.Error,
                    r.Source,
                    changes = r.Changes.OrderBy(c => c.Id).Select(c => new
                    {
                        c.Id,
                        c.DeviceId,
                        c.DeviceName,
                        ip = c.IpAddress,
                        field = c.FieldName,
                        oldValue = c.OldValue,
                        newValue = c.NewValue
                    })
                })
            });
        });

        api.MapGet("/history/ip", async (AppDbContext db, CancellationToken ct) =>
        {
            var rows = await db.DeviceIpHistories.AsNoTracking()
                .OrderByDescending(h => h.FirstSeenUtc)
                .Select(h => new
                {
                    h.Id,
                    h.DeviceId,
                    ip = h.IpAddress,
                    h.Port,
                    h.Source,
                    h.FirstSeenUtc,
                    h.LastSeenUtc,
                    deviceName = h.Device != null ? h.Device.Name : null,
                    hostname = h.Device != null ? h.Device.Hostname : null,
                    mac = h.Device != null ? h.Device.MacAddress : null,
                    type = h.Device != null && h.Device.ClientType != null ? h.Device.ClientType.Name : null,
                    subnetId = h.Device != null ? h.Device.SubnetId : null
                })
                .ToListAsync(ct);

            var subnets = await db.Subnets.AsNoTracking().OrderBy(s => s.Name)
                .Select(s => new { s.Id, s.Name, s.Cidr }).ToListAsync(ct);

            return Results.Ok(new
            {
                timeZone = ServerZone,
                rows = rows.Select(h => new
                {
                    h.Id,
                    h.DeviceId,
                    h.ip,
                    h.Port,
                    h.Source,
                    firstSeen = Iso(h.FirstSeenUtc),
                    lastSeen = h.LastSeenUtc.HasValue ? Iso(h.LastSeenUtc.Value) : null,
                    h.deviceName,
                    h.hostname,
                    h.mac,
                    h.type,
                    h.subnetId,
                    sortKey = SortKey(h.ip, h.Port)
                }),
                subnets
            });
        });

        api.MapGet("/about", () => Results.Ok(new
        {
            version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "Unknown",
            website = "https://netipam.com"
        }));
    }

    private static long SortKey(string ip, int? port)
        => IpCidr.TryParseIPv4(ip, out var v, out _) ? ((long)v << 16) + (port ?? 0) : long.MaxValue;

    private static void AddSegment(List<Segment> segs, DateTime dayStart, DateTime start, DateTime end, bool? status)
    {
        if (end <= start) return;
        var minutes = (int)Math.Round((end - start).TotalMinutes);
        if (minutes <= 0) return;
        var kind = status is null ? "unknown" : status.Value ? "online" : "offline";
        segs.Add(new Segment((int)Math.Round((start - dayStart).TotalMinutes), minutes, kind));
    }

    private static Dictionary<DateOnly, List<Segment>> BuildDayTimelines(
        DateOnly start, DateOnly end, List<Data.DeviceStatusEvent> evts, bool? defaultStatus)
    {
        var result = new Dictionary<DateOnly, List<Segment>>();
        var tz = TimeZoneInfo.Local;
        var nowLocal = DateTime.Now;
        var points = evts
            .Select(e => new EventPoint(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(e.ChangedAtUtc, DateTimeKind.Utc), tz), e.IsOnline))
            .OrderBy(e => e.Local)
            .ToList();

        var index = 0;
        bool? current = null;

        for (var date = start; date <= end; date = date.AddDays(1))
        {
            var dayStart = date.ToDateTime(TimeOnly.MinValue);
            var dayEnd = dayStart.AddDays(1);

            while (index < points.Count && points[index].Local < dayStart)
            {
                current = points[index].IsOnline;
                index++;
            }
            current ??= defaultStatus;

            var segments = new List<Segment>();
            var cursor = dayStart;
            var cutoff = date == DateOnly.FromDateTime(nowLocal) ? nowLocal : dayEnd;
            if (cutoff < dayStart) cutoff = dayStart;
            if (cutoff > dayEnd) cutoff = dayEnd;

            while (index < points.Count && points[index].Local < dayEnd)
            {
                var t = points[index].Local;
                if (t > cutoff) break;
                AddSegment(segments, dayStart, cursor, t, current);
                current = points[index].IsOnline;
                cursor = t;
                index++;
            }

            AddSegment(segments, dayStart, cursor, cutoff, current);
            if (cutoff < dayEnd)
                AddSegment(segments, dayStart, cutoff, dayEnd, null);
            result[date] = segments;
        }
        return result;
    }
}
