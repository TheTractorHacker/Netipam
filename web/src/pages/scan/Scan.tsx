import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scanApi, type ScanFlag, type ScanHost, type ScanProfile } from './api';
import { subnetsApi } from '../subnets/api';
import { useCan } from '../../auth';
import { ApiError } from '../../http';
import { PageHeader } from '../../components/ui';
import { Badge, ErrorNote, Field, Select, Spinner, Tabs, TextInput, timeAgo, useToast } from '../../components/kit';

type Filter = 'all' | ScanFlag;
const flagLabel: Record<ScanFlag, { text: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' }> = {
  unknown: { text: 'Unknown', tone: 'bad' },
  matches: { text: 'Matches', tone: 'ok' },
  'offline-but-responding': { text: 'Offline but responding', tone: 'warn' },
  'silent-known': { text: 'Silent known', tone: 'neutral' },
};
const MAX_ROWS = 500;
const PORTS_RE = /^\s*\d{1,5}(-\d{1,5})?(\s*,\s*\d{1,5}(-\d{1,5})?)*\s*$/;
const validPorts = (v: string) => PORTS_RE.test(v) && v.split(/[,-]/).every((n) => Number(n) >= 1 && Number(n) <= 65535);
const ipNum = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + (Number(o) || 0), 0);

export default function Scan() {
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [subnetId, setSubnetId] = useState<number | ''>('');
  const [profile, setProfile] = useState<ScanProfile>('quick');
  const [ports, setPorts] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const [cancelledId, setCancelledId] = useState<string | null>(null);
  const [portsTouched, setPortsTouched] = useState(false);
  const [portsServerErr, setPortsServerErr] = useState<string | null>(null);
  const subnets = useQuery({ queryKey: ['subnets'], queryFn: subnetsApi.list, enabled: can.edit });
  const recent = useQuery({ queryKey: ['scans'], queryFn: scanApi.list, enabled: can.edit, refetchInterval: (qq) => (qq.state.data?.items.some((s) => s.state === 'running') ? 3000 : false) });
  useEffect(() => {
    if (subnetId === '' && subnets.data?.items.length) setSubnetId(subnets.data.items[0].id);
  }, [subnets.data, subnetId]);
  useEffect(() => {
    if (!jobId && recent.data?.items.length) setJobId(recent.data.items[0].id);
  }, [recent.data, jobId]);

  const job = useQuery({
    queryKey: ['scans', jobId], queryFn: () => scanApi.get(jobId!), enabled: can.edit && !!jobId,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
    refetchInterval: (qq) => (qq.state.status === 'error' ? false : qq.state.data?.state === 'running' ? 1000 : false),
  });
  const j = job.data;
  const running = j?.state === 'running';
  // A stale id (server restart, evicted from the recent window) -> forget it so the newest scan is selected.
  useEffect(() => {
    if (job.error instanceof ApiError && job.error.status === 404) { setJobId(null); qc.invalidateQueries({ queryKey: ['scans'], exact: true }); }
  }, [job.error]); // eslint-disable-line react-hooks/exhaustive-deps
  // Refresh the recent list only when the selected scan goes running -> finished.
  const prev = useRef<{ id: string; running: boolean } | null>(null);
  useEffect(() => {
    if (!j) return;
    if (prev.current && prev.current.id === j.id && prev.current.running && !running) qc.invalidateQueries({ queryKey: ['scans'], exact: true });
    prev.current = { id: j.id, running };
  }, [j?.id, running]); // eslint-disable-line react-hooks/exhaustive-deps
  const runningId = running ? jobId : recent.data?.items.find((s) => s.state === 'running')?.id ?? null;
  const anyRunning = runningId !== null;
  useEffect(() => { if (!anyRunning) setCancelledId(null); }, [anyRunning]);
  const cancelling = anyRunning && cancelledId === runningId;

  const start = useMutation({
    mutationFn: () => scanApi.start({ subnetId: Number(subnetId), profile, ports: profile === 'custom' ? ports.trim() : undefined }),
    onSuccess: (r) => { setJobId(r.id); setFilter('all'); setPortsServerErr(null); qc.invalidateQueries({ queryKey: ['scans'] }); toast('Scan started'); },
    onError: (e: Error) => {
      toast(e.message, 'bad');
      if (e instanceof ApiError && e.status === 409) qc.invalidateQueries({ queryKey: ['scans'] });
      else if (e instanceof ApiError && e.status === 400 && profile === 'custom') setPortsServerErr(e.message);
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => scanApi.cancel(id),
    onSuccess: (_r, id) => { setCancelledId(id); qc.invalidateQueries({ queryKey: ['scans'] }); toast('Cancelling scan'); },
    onError: (e: Error) => { toast(e.message, 'bad'); qc.invalidateQueries({ queryKey: ['scans'] }); },
  });

  const hosts = j?.hosts ?? [];
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: hosts.length, unknown: 0, 'offline-but-responding': 0, 'silent-known': 0, matches: 0 };
    hosts.forEach((h) => { c[h.flag] = (c[h.flag] ?? 0) + 1; });
    return c;
  }, [hosts]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return hosts
      .filter((h) => (filter === 'all' || h.flag === filter) && (!t || h.ip.includes(t) || (h.hostname ?? '').toLowerCase().includes(t) || (h.deviceName ?? '').toLowerCase().includes(t)))
      .sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
  }, [hosts, filter, q]);
  const visible = useMemo(() => shown.slice(0, MAX_ROWS), [shown]);
  const portsErr = profile === 'custom' && portsTouched && ports.trim() && !validPorts(ports) ? 'Use port numbers 1-65535, comma separated, ranges like 8000-8100' : portsServerErr;
  const responded = hosts.filter((h) => h.alive).length;
  const pct = j && j.total > 0 ? Math.min(100, Math.round((j.scanned / j.total) * 100)) : 0;
  const canStart = can.admin && subnetId !== '' && !start.isPending && !anyRunning && (profile !== 'custom' || (ports.trim().length > 0 && validPorts(ports)));
  const noSubnets = subnets.isSuccess && subnets.data.items.length === 0;

  if (!can.edit) {
    return (
      <>
        <PageHeader title="Network scan" sub="Discover live hosts and open ports in a subnet" />
        <div className="card scan-form"><span className="muted" style={{ gridColumn: '1 / -1' }}>Editors and admins only.</span></div>
      </>
    );
  }


  return (
    <>
      <PageHeader title="Network scan" sub="Discover live hosts and open ports in a subnet" />
      <form className="card scan-form" onSubmit={(e) => { e.preventDefault(); if (canStart) start.mutate(); }}>
        <Field label="Subnet">
          <Select value={subnetId} onChange={(e) => setSubnetId(e.target.value ? Number(e.target.value) : '')} disabled={!can.admin || anyRunning}>
            {subnets.isLoading && <option value="">Loading…</option>}
            {noSubnets && <option value="">No subnets defined</option>}
            {subnets.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
          </Select>
        </Field>
        <Field label="Profile">
          <Select value={profile} onChange={(e) => setProfile(e.target.value as ScanProfile)} disabled={!can.admin || anyRunning}>
            <option value="discover">Discover only</option>
            <option value="quick">Quick (top 25)</option>
            <option value="common">Common (top 100)</option>
            <option value="custom">Custom ports</option>
          </Select>
        </Field>
        {profile === 'custom' ? (
          <Field label="Ports" hint="e.g. 22,80,443,8000-8100" error={portsErr}>
            <TextInput className="mono" value={ports} onChange={(e) => { setPorts(e.target.value); setPortsTouched(true); setPortsServerErr(null); }} disabled={!can.admin || anyRunning} />
          </Field>
        ) : <div />}
        <div className="scan-actions">
          {can.admin && !anyRunning && <button className="btn primary" type="submit" disabled={!canStart}>{start.isPending ? 'Starting…' : 'Start scan'}</button>}
          {can.admin && anyRunning && (
            <button className="btn" type="button" onClick={() => { if (runningId) { setJobId(runningId); cancel.mutate(runningId); } }} disabled={cancel.isPending || cancelling}>
              {cancel.isPending || cancelling ? 'Cancelling…' : 'Cancel scan'}
            </button>
          )}
        </div>
        {noSubnets && <span className="muted" style={{ gridColumn: '1 / -1' }}>No subnets defined yet. <Link to="/subnets">Add a subnet</Link> to scan it.</span>}
        {!can.admin && <span className="muted" style={{ gridColumn: '1 / -1' }}>Only administrators can start scans. Results are read-only.</span>}
      </form>

      {subnets.error && <ErrorNote error={subnets.error} />}

      {jobId && job.isLoading && <Spinner />}
      {job.error && <ErrorNote error={job.error} />}

      {j && (running || j.state === 'cancelled' || j.state === 'failed') && (
        <div className="card scan-progress">
          <div aria-live="polite">
            {running ? 'Scanning' : j.state === 'failed' ? 'Scan failed' : 'Scan cancelled'} {j.subnetName} ({j.cidr}) — {j.scanned}/{j.total} probes ({pct}%)
          </div>
          {running && <div className="scan-bar" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>}
          {j.error && <div className="error" role="status">{j.error}</div>}
        </div>
      )}

      {j && (hosts.length > 0 || j.state === 'done') && (
        <>
          {hosts.length === 0 ? (
            <div className="muted" style={{ marginBottom: 10 }}>No hosts responded.</div>
          ) : (
            <>
              <p className="scan-summary">
                {responded} host{responded === 1 ? '' : 's'} responded, {counts.unknown} unknown
                {j.ports.length > 0 && ` · ${j.ports.length} ports per host`}
              </p>
              <div className="scan-filter" style={{ marginBottom: 10 }}>
                <Tabs<Filter> value={filter} onChange={setFilter} tabs={[
                  { id: 'all', label: 'All', count: counts.all },
                  { id: 'unknown', label: 'Unknown', count: counts.unknown },
                  { id: 'offline-but-responding', label: 'Offline-but-responding', count: counts['offline-but-responding'] },
                  { id: 'silent-known', label: 'Silent known', count: counts['silent-known'] },
                  { id: 'matches', label: 'Matches', count: counts.matches },
                ]} />
                <input className="search" placeholder="Filter IP or host name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter results" />
              </div>
              <div className="card flush scan-table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>IP</th><th>Host name</th><th className="scan-hide-sm">MAC</th><th className="scan-hide-sm">RTT</th><th>Open ports</th><th>Status</th><th><span className="scan-sr">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {visible.map((h) => <HostRow key={h.ip} h={h} canEdit={can.edit} />)}
                    {shown.length === 0 && <tr><td colSpan={7} className="muted">No matching hosts.</td></tr>}
                    {shown.length > MAX_ROWS && <tr><td colSpan={7} className="muted">Showing {MAX_ROWS} of {shown.length}. Refine the filter to see the rest.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {recent.data && recent.data.items.length > 0 && (
        <div className="card flush" style={{ marginTop: 14 }}>
          <div className="scan-recent-title">Recent scans</div>
          <ul className="scan-recent">
            {recent.data.items.map((s) => (
              <li key={s.id}>
                <button type="button" aria-current={s.id === jobId} className={s.id === jobId ? 'on' : ''} onClick={() => { setJobId(s.id); setFilter('all'); }}>
                  <span>{s.subnetName} <span className="mono muted">{s.cidr}</span></span>
                  <Badge tone={s.state === 'done' ? 'ok' : s.state === 'running' ? 'info' : s.state === 'failed' ? 'bad' : 'neutral'}>{s.state}</Badge>
                  <span className="muted">{s.profile} · {s.aliveCount} alive</span>
                  <span className="when">{timeAgo(s.startedUtc)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

const HostRow = memo(function HostRow({ h, canEdit }: { h: ScanHost; canEdit: boolean }) {
  const f = flagLabel[h.flag] ?? flagLabel.unknown;
  const add = h.flag === 'unknown' && canEdit ? <Link className="btn sm" to={`/clients?add=client&ip=${encodeURIComponent(h.ip)}`}>Add as client</Link> : null;
  const shownPorts = h.openPorts.slice(0, 50);
  return (
    <tr>
      <td className="mono">{h.ip}{add && <div className="scan-add-sm">{add}</div>}</td>
      <td className="scan-name">{h.hostname ?? (h.known && h.deviceId != null ? null : <span className="muted">—</span>)}
        {h.known && h.deviceId != null && <div><Link to={`/devices?open=${h.deviceId}`}>{h.deviceName ?? 'Open device'}</Link></div>}</td>
      <td className="mono scan-hide-sm">{h.mac ?? '—'}</td>
      <td className="num scan-hide-sm">{h.rttMs != null ? `${Math.round(h.rttMs)} ms` : '—'}</td>
      <td>
        {shownPorts.length ? (
          <div className="scan-ports">
            {shownPorts.map((p) => <span key={p.port} className="scan-port">{p.port}{p.service ? ` ${p.service}` : ''}</span>)}
            {h.openPorts.length > 50 && <span className="muted">+{h.openPorts.length - 50}</span>}
          </div>
        ) : <span className="muted">—</span>}
      </td>
      <td><Badge tone={f.tone}>{f.text}</Badge></td>
      <td className="scan-add-lg">{add}</td>
    </tr>
  );
});
