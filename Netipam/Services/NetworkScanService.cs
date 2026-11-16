using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Globalization;
using System.Net.Sockets;
using Netipam.Data;

namespace Netipam.Services;

/// <summary>In-memory, one-at-a-time nmap-like scanner (ping/TCP discovery + TCP connect port scan).</summary>
public sealed class NetworkScanService
{
    public const int MaxHosts = 1024;
    public const int MaxCustomPorts = 1024;
    public const long MaxProbes = 200_000;
    private const int MaxParallelProbes = 128;
    private const int MaxJobsKept = 10;
    private const int MaxParallelHosts = 64;
    private const int MaxParallelPortsPerHost = 32;
    private const int MaxParallelDns = 16;
    private const int MaxPortsStringLength = 8 * 1024;
    private static readonly TimeSpan ScanTimeout = TimeSpan.FromMinutes(15);
    private static readonly uint MetadataIp = 0xA9FEA9FE; // 169.254.169.254 (cloud metadata), never scanned
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromMilliseconds(500);
    private static readonly int PingTimeoutMs = 700;
    private static readonly int[] DiscoveryPorts = { 22, 80, 443, 445, 3389, 8080, 53 };

    public sealed record KnownDevice(int Id, string Name, bool IsOnline);
    public sealed record OpenPort(int Port, string? Service);
    public sealed record ScanHost(string Ip, bool Alive, double? RttMs, string? Hostname, string? Mac,
        List<OpenPort> OpenPorts, bool Known, int? DeviceId, string? DeviceName, bool? DeviceOnline, string Flag);
    public sealed record ScanSummary(string Id, int SubnetId, string SubnetName, string Cidr, string Profile,
        string State, DateTime StartedUtc, DateTime? FinishedUtc, int Total, int Scanned, int AliveCount);
    public sealed record ScanJob(string Id, int SubnetId, string SubnetName, string Cidr, string Profile,
        string State, DateTime StartedUtc, DateTime? FinishedUtc, int Total, int Scanned, int AliveCount,
        int[] Ports, string? Error, List<ScanHost> Hosts);

    private sealed class HostResult
    {
        public double? Rtt;
        public string? Hostname;
        public string? Mac;
        public ConcurrentBag<int> Open = new();
    }

    private sealed class Job
    {
        public string Id = Guid.NewGuid().ToString("N");
        public int SubnetId; public string SubnetName = ""; public string Cidr = ""; public string Profile = "";
        public volatile string State = "running";
        public DateTime StartedUtc = DateTime.UtcNow; public DateTime? FinishedUtc;
        public int Total; public int Scanned;
        public volatile bool PingBroken;
        public int[] Ports = Array.Empty<int>();
        public string? Error;
        public uint First, Last;
        public Dictionary<uint, KnownDevice> Known = new();
        public ConcurrentDictionary<uint, HostResult> Results = new();
        public CancellationTokenSource Cts = new();
        public SemaphoreSlim? Gate, DnsGate;
    }

    private readonly object _gate = new();
    private readonly List<Job> _jobs = new();
    private readonly ILogger<NetworkScanService> _log;

    public NetworkScanService(ILogger<NetworkScanService> log) => _log = log;

    // ---------- validation helpers ----------
    public static bool IsPrivate(IpCidr.CidrInfo info)
    {
        static bool In(uint v, string net, int prefix)
        {
            IpCidr.TryParseIPv4(net, out var n, out _);
            var mask = IpCidr.PrefixToMask(prefix);
            return (v & mask) == (n & mask);
        }
        foreach (var (net, p) in new[] { ("10.0.0.0", 8), ("172.16.0.0", 12), ("192.168.0.0", 16), ("100.64.0.0", 10), ("169.254.0.0", 16) })
            if (info.PrefixLength >= p && In(info.NetworkUInt, net, p) && In(info.BroadcastUInt, net, p)) return true;
        return false;
    }

    public static (uint first, uint last) HostRange(IpCidr.CidrInfo info) =>
        info.PrefixLength >= 31 ? (info.NetworkUInt, info.BroadcastUInt) : (info.NetworkUInt + 1, info.BroadcastUInt - 1);

    public static bool TryResolvePorts(string profile, string? custom, out int[] ports, out string? error)
    {
        ports = Array.Empty<int>(); error = null;
        if (custom != null && custom.Length > MaxPortsStringLength) { error = "Port list is too long."; return false; }
        switch (profile)
        {
            case "discover": return true;
            case "quick": ports = TopPorts.Take(25).ToArray(); return true;
            case "common": ports = TopPorts.Take(100).ToArray(); return true;
            case "custom":
                var set = new SortedSet<int>();
                foreach (var raw in (custom ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    var parts = raw.Split('-', 2);
                    if (!int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var a) || a is < 1 or > 65535) { error = $"Invalid port '{raw}'."; return false; }
                    var b = a;
                    if (parts.Length == 2 && (!int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out b) || b < a || b > 65535)) { error = $"Invalid port range '{raw}'."; return false; }
                    for (var p = a; p <= b; p++)
                    {
                        set.Add(p);
                        if (set.Count > MaxCustomPorts) { error = $"At most {MaxCustomPorts} ports are allowed."; return false; }
                    }
                }
                if (set.Count == 0) { error = "Enter at least one port."; return false; }
                ports = set.ToArray(); return true;
            default: error = "Unknown profile."; return false;
        }
    }

    // ---------- public API ----------
    /// <summary>Starts a scan; returns null if one is already running.</summary>
    public string? TryStart(int subnetId, string subnetName, IpCidr.CidrInfo info, string profile, int[] ports,
        IEnumerable<(string ip, KnownDevice dev)> knownDevices)
    {
        var (first, last) = HostRange(info);
        var job = new Job
        {
            SubnetId = subnetId, SubnetName = subnetName, Cidr = info.Cidr, Profile = profile, Ports = ports,
            First = first, Last = last, Total = (int)(last - first + 1)
        };
        foreach (var (ip, dev) in knownDevices)
            if (IpCidr.TryParseIPv4(ip, out var u, out _) && u >= first && u <= last) job.Known.TryAdd(u, dev);

        lock (_gate)
        {
            if (_jobs.Any(j => j.State == "running")) return null;
            _jobs.Add(job);
            while (_jobs.Count > MaxJobsKept)
            {
                var old = _jobs[0];
                _jobs.RemoveAt(0);
                if (old.State != "running") { try { old.Cts.Dispose(); } catch { } }
            }
        }
        _ = Task.Run(() => RunAsync(job));
        return job.Id;
    }

    public List<ScanSummary> List()
    {
        lock (_gate) return _jobs.AsEnumerable().Reverse().Select(Summary).ToList();
    }

    public ScanJob? Get(string id)
    {
        Job? j; lock (_gate) j = _jobs.FirstOrDefault(x => x.Id == id);
        return j == null ? null : Full(j);
    }

    public bool Cancel(string id)
    {
        Job? j; lock (_gate) j = _jobs.FirstOrDefault(x => x.Id == id);
        if (j == null) return false;
        try { j.Cts.Cancel(); } catch { }
        return true;
    }

    // ---------- snapshots ----------
    private static ScanSummary Summary(Job j) => new(j.Id, j.SubnetId, j.SubnetName, j.Cidr, j.Profile, j.State,
        j.StartedUtc, j.FinishedUtc, j.Total, Math.Min(j.Scanned, j.Total), j.Results.Count);

    private static ScanJob Full(Job j)
    {
        var hosts = new List<ScanHost>();
        foreach (var kv in j.Results.OrderBy(k => k.Key))
        {
            j.Known.TryGetValue(kv.Key, out var dev);
            var r = kv.Value;
            var ports = r.Open.Distinct().OrderBy(p => p).Select(p => new OpenPort(p, ServiceName(p))).ToList();
            var flag = dev == null ? "unknown" : dev.IsOnline ? "matches" : "offline-but-responding";
            hosts.Add(new ScanHost(IpCidr.UIntToIPv4(kv.Key), true, r.Rtt, r.Hostname, r.Mac, ports,
                dev != null, dev?.Id, dev?.Name, dev?.IsOnline, flag));
        }
        if (j.State == "done")
            foreach (var kv in j.Known.OrderBy(k => k.Key))
                if (!j.Results.ContainsKey(kv.Key))
                    hosts.Add(new ScanHost(IpCidr.UIntToIPv4(kv.Key), false, null, null, null, new(), true,
                        kv.Value.Id, kv.Value.Name, kv.Value.IsOnline, "silent-known"));
        var s = Summary(j);
        return new ScanJob(s.Id, s.SubnetId, s.SubnetName, s.Cidr, s.Profile, s.State, s.StartedUtc, s.FinishedUtc,
            s.Total, s.Scanned, s.AliveCount, j.Ports, j.Error, hosts.Take(4096).ToList());
    }

    // ---------- scanning ----------
    private async Task RunAsync(Job job)
    {
        var ct = job.Cts.Token;
        job.Gate = new SemaphoreSlim(MaxParallelProbes);
        job.DnsGate = new SemaphoreSlim(MaxParallelDns);
        string finalState;
        try
        {
            job.Cts.CancelAfter(ScanTimeout);
            var count = (long)job.Last - job.First + 1;
            var ips = Enumerable.Range(0, (int)count).Select(i => job.First + (uint)i);
            await Parallel.ForEachAsync(ips,
                new ParallelOptions { MaxDegreeOfParallelism = MaxParallelHosts, CancellationToken = ct },
                async (ip, token) =>
                {
                    try
                    {
                        await ScanHostAsync(job, ip, token);
                        Interlocked.Increment(ref job.Scanned);
                    }
                    catch (OperationCanceledException) { }
                    catch (Exception ex) { _log.LogDebug(ex, "Scan host {Ip} failed", ip); Interlocked.Increment(ref job.Scanned); }
                });

            if (!ct.IsCancellationRequested)
            {
                var arp = ReadArp();
                foreach (var kv in job.Results)
                    if (arp.TryGetValue(IpCidr.UIntToIPv4(kv.Key), out var mac)) kv.Value.Mac = mac;
            }
            finalState = ct.IsCancellationRequested ? "cancelled" : "done";
        }
        catch (OperationCanceledException) { finalState = "cancelled"; }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Network scan failed");
            job.Error = "Scan failed.";
            finalState = "failed";
        }
        // Publish FinishedUtc before the volatile State write so pollers never see a finished state without it.
        job.FinishedUtc = DateTime.UtcNow;
        job.State = finalState;
        try { job.Gate?.Dispose(); job.DnsGate?.Dispose(); } catch { }
        try { job.Cts.Dispose(); } catch { }
    }

    private static bool IsPingUnsupported(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException!)
        {
            if (e is SocketException se && (se.SocketErrorCode == SocketError.AccessDenied
                || se.SocketErrorCode == SocketError.ProtocolNotSupported
                || se.SocketErrorCode == SocketError.AddressFamilyNotSupported)) return true;
            if (e is UnauthorizedAccessException || e is PlatformNotSupportedException
                || e is System.ComponentModel.Win32Exception) return true;
            if (e.InnerException == null) break;
        }
        return false;
    }

    private async Task ScanHostAsync(Job job, uint ip, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (ip == MetadataIp) return;
        var gate = job.Gate!;
        var addr = IPAddress.Parse(IpCidr.UIntToIPv4(ip));
        double? rtt = null;
        var alive = false;
        var open = new List<int>();

        if (!job.PingBroken)
        {
            await gate.WaitAsync(ct);
            try
            {
                using var ping = new Ping();
                var reply = await ping.SendPingAsync(addr, PingTimeoutMs);
                if (reply.Status == IPStatus.Success) { alive = true; rtt = reply.RoundtripTime; }
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) { if (IsPingUnsupported(ex)) job.PingBroken = true; }
            finally { gate.Release(); }
        }

        if (!alive)
        {
            for (var i = 0; i < DiscoveryPorts.Length && !alive; i += 3)
            {
                ct.ThrowIfCancellationRequested();
                var chunk = DiscoveryPorts.Skip(i).Take(3).ToArray();
                var probes = await Task.WhenAll(chunk.Select(p => ProbeAsync(addr, p, gate, ct)));
                for (var k = 0; k < chunk.Length; k++)
                {
                    var (res, ms) = probes[k];
                    if (res == Probe.Closed) continue;
                    alive = true; rtt ??= ms;
                    if (res == Probe.Open) open.Add(chunk[k]);
                }
            }
        }
        if (!alive) return;

        var result = new HostResult { Rtt = rtt };
        foreach (var p in open) result.Open.Add(p);
        job.Results[ip] = result;

        var dnsTask = ResolveHostnameAsync(job, addr, result, ct);
        var remaining = job.Ports.Where(p => !open.Contains(p)).ToArray();
        await Parallel.ForEachAsync(remaining,
            new ParallelOptions { MaxDegreeOfParallelism = MaxParallelPortsPerHost, CancellationToken = ct },
            async (p, token) =>
            {
                var (res, _) = await ProbeAsync(addr, p, gate, token);
                if (res == Probe.Open) result.Open.Add(p);
            });
        await dnsTask;
    }

    private static async Task ResolveHostnameAsync(Job job, IPAddress addr, HostResult result, CancellationToken ct)
    {
        var dnsGate = job.DnsGate!;
        await dnsGate.WaitAsync(ct);
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(1));
            var ipStr = addr.ToString();
            var name = (await Dns.GetHostEntryAsync(ipStr, cts.Token)).HostName;
            if (!string.IsNullOrWhiteSpace(name) && !string.Equals(name, ipStr, StringComparison.OrdinalIgnoreCase))
                result.Hostname = name;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { }
        finally { dnsGate.Release(); }
    }

    private enum Probe { Open, Refused, Closed }

    private static async Task<(Probe, double?)> ProbeAsync(IPAddress addr, int port, SemaphoreSlim gate, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            using var sock = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(ConnectTimeout);
            var sw = Stopwatch.StartNew();
            try
            {
                await sock.ConnectAsync(new IPEndPoint(addr, port), cts.Token);
                return (Probe.Open, sw.Elapsed.TotalMilliseconds);
            }
            catch (SocketException se) when (se.SocketErrorCode == SocketError.ConnectionRefused || se.SocketErrorCode == SocketError.ConnectionReset)
            {
                return (Probe.Refused, sw.Elapsed.TotalMilliseconds);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception) { return (Probe.Closed, null); }
        }
        finally { gate.Release(); }
    }

    private static Dictionary<string, string> ReadArp()
    {
        var map = new Dictionary<string, string>();
        try
        {
            foreach (var line in File.ReadLines("/proc/net/arp").Skip(1))
            {
                var c = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (c.Length >= 4 && c[3] != "00:00:00:00:00:00") map[c[0]] = c[3].ToUpperInvariant();
            }
        }
        catch { }
        return map;
    }

    // ---------- port tables ----------
    private static readonly int[] TopPorts =
    {
        80, 443, 22, 21, 25, 53, 23, 110, 111, 135, 139, 143, 445, 993, 995, 1723, 3306, 3389, 5900, 8080,
        8443, 8000, 8888, 587, 631,
        // 26-100
        1025, 1433, 1521, 2049, 2082, 2083, 2181, 2375, 2376, 3000, 3128, 3260, 4443, 5000, 5001, 5060, 5432,
        5601, 5672, 5800, 5901, 5985, 5986, 6379, 6443, 6667, 7001, 7070, 8008, 8081, 8082, 8086, 8096, 8123,
        8181, 8200, 8291, 8883, 9000, 9090, 9100, 9200, 9300, 9443, 10000, 10250, 1883, 1900, 123, 161, 389,
        465, 514, 548, 636, 873, 902, 1080, 1194, 1701, 1812, 2222, 3478, 5353, 5555, 6881, 8009, 8554, 32400
    };

    private static readonly Dictionary<int, string> Services = new()
    {
        [21] = "ftp", [22] = "ssh", [23] = "telnet", [25] = "smtp", [53] = "dns", [80] = "http", [110] = "pop3",
        [111] = "rpcbind", [123] = "ntp", [135] = "msrpc", [139] = "netbios-ssn", [143] = "imap", [161] = "snmp",
        [389] = "ldap", [443] = "https", [445] = "smb", [465] = "smtps", [514] = "syslog", [548] = "afp",
        [587] = "submission", [631] = "ipp", [636] = "ldaps", [873] = "rsync", [902] = "vmware", [993] = "imaps",
        [995] = "pop3s", [1080] = "socks", [1194] = "openvpn", [1433] = "mssql", [1521] = "oracle", [1723] = "pptp",
        [1883] = "mqtt", [1900] = "upnp", [2049] = "nfs", [2181] = "zookeeper", [2375] = "docker",
        [2376] = "docker-tls", [3000] = "http-alt", [3128] = "squid", [3260] = "iscsi", [3306] = "mysql",
        [3389] = "rdp", [5000] = "upnp/http-alt", [5060] = "sip", [5353] = "mdns", [5432] = "postgresql",
        [5601] = "kibana", [5672] = "amqp", [5900] = "vnc", [5985] = "winrm", [5986] = "winrm-tls",
        [6379] = "redis", [6443] = "kubernetes", [8000] = "http-alt", [8006] = "proxmox", [8008] = "http-alt",
        [8080] = "http-proxy", [8081] = "http-alt", [8086] = "influxdb", [8096] = "jellyfin", [8123] = "homeassistant",
        [8291] = "winbox", [8443] = "https-alt", [8883] = "mqtt-tls", [8888] = "http-alt", [9000] = "http-alt",
        [9090] = "prometheus", [9100] = "jetdirect", [9200] = "elasticsearch", [10000] = "webmin",
        [10250] = "kubelet", [32400] = "plex", [8554] = "rtsp", [8009] = "chromecast", [3478] = "stun"
    };

    public static string? ServiceName(int port) => Services.TryGetValue(port, out var s) ? s : null;
}
