import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dashboardApi, type CriticalDevice, type DashboardData, type DiscoveryAlert, type FirmwareAlert,
  type OfflineAlert, type SubnetCard,
} from './api';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ErrorNote, Field, Modal, Select, Spinner, TextInput, timeAgo, useToast } from '../../components/kit';
import { useCan } from '../../auth';
import './dashboard.css';

/* ---------- helpers ---------- */
function parseUtc(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
}
/** Format with the classic .NET-style DateFormat setting (MM dd yyyy HH mm ss), falling back to the default. */
function fmtDate(iso: string | null | undefined, fmt: string): string {
  if (!iso) return '—';
  const d = parseUtc(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const map: Record<string, string> = {
    yyyy: String(d.getFullYear()), MM: p(d.getMonth() + 1), dd: p(d.getDate()),
    HH: p(d.getHours()), mm: p(d.getMinutes()), ss: p(d.getSeconds()),
  };
  return (fmt || 'MM-dd-yyyy HH:mm').replace(/yyyy|MM|dd|HH|mm|ss/g, (t) => map[t]);
}
const absRel = (iso: string | null | undefined) => (iso ? `${fmtDate(iso, 'MM-dd-yyyy HH:mm')} (${timeAgo(iso)})` : '—');
const dash = (v: string | null | undefined) => (v && v.trim() ? v : '-');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function Conn({ type, detail }: { type: string | null; detail: string | null }) {
  if (!type || !type.trim()) return null;
  const wifi = type.trim().toLowerCase() === 'wifi';
  const d = (detail ?? '').toLowerCase();
  const tone = !wifi ? 'plain' : d.includes('2.4') || d.includes('2g') ? 'warn' : d.includes('6') ? 'ok' : 'info';
  const label = detail && detail.trim() ? `${type} | ${detail}` : type;
  return (
    <span className={`dash-conn ${tone}`} title={label} aria-label={label} role="img">
      {wifi ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h4M17 12h4M7 8v8h10V8z" /></svg>
      )}
    </span>
  );
}

function StatusDot({ tracked, online }: { tracked: boolean; online: boolean }) {
  const label = tracked ? (online ? 'Online' : 'Offline') : 'Not tracked';
  return <span className={'dot ' + (tracked ? (online ? 'on' : 'down') : '')} title={label} role="img" aria-label={label} />;
}

function HeroIcon({ tone }: { tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <svg className="dash-hero-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {tone === 'ok' ? <><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></>
        : tone === 'warn' ? <><circle cx="12" cy="12" r="10" /><path d="M12 11v5M12 8h.01" /></>
        : <><circle cx="12" cy="12" r="10" /><path d="M12 7v6M12 16.5h.01" /></>}
    </svg>
  );
}

/* ---------- first run ---------- */
function Welcome() {
  return (
    <section className="card callout dash-welcome" aria-labelledby="dash-welcome-h">
      <div>
        <h2 id="dash-welcome-h">Welcome to Netipam</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>Nothing here yet. Three quick steps and this dashboard fills itself in.</p>
      </div>
      <div className="dash-steps">
        <div className="dash-step">
          <span className="strong">1 · Connect UniFi</span>
          <span className="muted small">Add your controller URL and a local user or API key.</span>
          <div><a className="btn primary sm" href="/settings">Open settings</a></div>
        </div>
        <div className="dash-step">
          <span className="strong">2 · Add your subnets</span>
          <span className="muted small">Define the networks so devices are mapped to the right range.</span>
          <div><a className="btn sm" href="/subnets">Go to subnets</a></div>
        </div>
        <div className="dash-step">
          <span className="strong">3 · Import devices</span>
          <span className="muted small">Pull clients and devices in, then turn on the updater.</span>
          <div><a className="btn sm" href="/unifi-import">Open import</a></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- hero ---------- */
function Hero({ d }: { d: DashboardData }) {
  const t = d.totals;
  const attention = t.offlineClients + t.offlineAlerts + t.discoveryAlerts + t.firmwareAlerts;
  const wanDown = d.settings.showWanStatus && t.wanDown;
  const tone: 'ok' | 'warn' | 'bad' = t.offlineClients > 0 || wanDown ? 'bad' : attention > 0 ? 'warn' : 'ok';
  const title = wanDown ? 'Internet connection is down'
    : t.offlineClients > 0 ? `${t.offlineClients} ${plural(t.offlineClients, 'client is', 'clients are')} offline`
    : attention > 0 ? `${attention} ${plural(attention, 'item needs', 'items need')} your review`
    : 'Everything is running smoothly';
  const pills: { n: number; label: string; href: string; tone: 'on-bad' | 'on-warn' }[] = [
    { n: t.offlineClients, label: 'offline', href: '/clients/offline', tone: 'on-bad' },
    { n: t.offlineAlerts, label: 'offline alerts', href: '/alerts/offline', tone: 'on-bad' },
    { n: t.discoveryAlerts, label: 'new devices', href: '/alerts/discovery', tone: 'on-warn' },
    { n: t.firmwareAlerts, label: 'firmware updates', href: '/devices', tone: 'on-warn' },
  ];
  return (
    <section className={`dash-hero ${tone}`} aria-label="Network health">
      <div className="dash-hero-main">
        <HeroIcon tone={tone} />
        <div>
          <div className="dash-hero-title" role="status">{title}</div>
          <div className="dash-hero-sub">
            {t.clients} clients · {t.devices} devices · {t.wired} wired · {t.wifi} wireless
          </div>
        </div>
      </div>
      <div className="dash-pills">
        {pills.map((p) => (
          <a key={p.label} className={'dash-pill' + (p.n > 0 ? ` ${p.tone}` : '')} href={p.href}>
            <b>{p.n}</b> {p.label}
          </a>
        ))}
      </div>
      {d.settings.showWanStatus && d.wan.length > 0 && (
        <div className="dash-wan" aria-label="WAN status">
          {d.wan.map((w, i) => (
            <Badge key={i} tone={w.isUp === true ? 'ok' : w.isUp === false ? 'bad' : 'neutral'}>
              {w.label}: {w.isUp === true ? 'Up' : w.isUp === false ? 'Down' : 'Unknown'}{w.ip ? ` • ${w.ip}` : ''}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- your networks ---------- */
function Networks({ subnets }: { subnets: SubnetCard[] }) {
  const sorted = [...subnets].sort((a, b) => (a.vlanId ?? 1e9) - (b.vlanId ?? 1e9) || a.name.localeCompare(b.name));
  return (
    <section aria-labelledby="dash-nets-h">
      <div className="dash-section-head">
        <h2 id="dash-nets-h">Your networks</h2>
        <a className="btn ghost sm" href="/subnets">Manage subnets</a>
      </div>
      {sorted.length === 0 ? (
        <Empty>No subnets yet. <a href="/subnets">Add one</a> and it will show up here as a live card.</Empty>
      ) : (
        <div className="dash-grid">
          {sorted.map((r) => {
            const pct = r.usable > 0 ? Math.round((r.used * 100) / r.usable) : 0;
            const tone = pct >= 90 ? 'crit' : pct >= 75 ? 'warn' : '';
            return (
              <a key={r.id} className={`dash-net ${tone}`} href={`/subnets/${r.id}/ips`} aria-label={`${r.name}, ${r.cidr}, ${pct}% used`}>
                <div className="dash-net-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="dash-net-name">{r.name}</div>
                    <div className="dash-net-cidr">{r.cidr}</div>
                  </div>
                  {r.vlanId !== null && <Badge>VLAN {r.vlanId}</Badge>}
                </div>
                <div className="dash-net-body">
                  <div className="dash-ring" style={{ ['--p' as string]: Math.min(100, pct) }}><span>{pct}%</span></div>
                  <div className="dash-net-stats">
                    <div><b>{r.used}</b> of {r.usable} used</div>
                    <div><b>{r.free}</b> free</div>
                    <div><b>{r.clients}</b> clients · <b>{r.devices}</b> devices</div>
                    {r.offline > 0 && <div className="off"><b>{r.offline}</b> offline</div>}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- panel shell ---------- */
function Panel({ title, count, more, children }: { title: string; count?: number; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="dash-section-head">
        <h2>{title}{count !== undefined && count > 0 && <span className="count"><Badge tone="warn">{count}</Badge></span>}</h2>
        {more && <a className="btn ghost sm" href={more.href}>{more.label}</a>}
      </div>
      <div className="card flush">{children}</div>
    </section>
  );
}

/* ---------- offline alerts ---------- */
function OfflinePanel({ d, canEdit, onDone }: { d: DashboardData; canEdit: boolean; onDone: () => void }) {
  const toast = useToast();
  const act = useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: 'ack' | 'ignore' }) =>
      kind === 'ack' ? dashboardApi.ackOffline(id) : dashboardApi.ignoreOffline(id),
    onSuccess: (_r, v) => { toast(v.kind === 'ack' ? 'Alert acknowledged' : 'Device ignored and alert acknowledged'); onDone(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const rows: OfflineAlert[] = d.offlineAlerts;
  return (
    <Panel title="Offline alerts" count={d.totals.offlineAlerts} more={{ href: '/alerts/offline', label: 'More…' }}>
      {rows.length === 0 ? <div className="dash-ok-note">No unacknowledged offline alerts.</div> : (
        <table className="table">
          <thead>
            <tr>
              <th className="w1"><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Status</span></th>
              <th>Client</th><th>IP</th><th>Conn</th><th className="dash-hide-sm">Upstream</th><th className="dash-hide-sm">Host</th>
              <th className="dash-hide-sm">Location</th><th className="dash-hide-sm">Rack</th><th>Went offline</th><th>Recovered</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td><span className={'dot ' + (a.cameOnlineAtUtc ? 'on' : 'down')} role="img"
                  aria-label={a.cameOnlineAtUtc ? 'Recovered, still unacknowledged' : 'Offline, not yet recovered'}
                  title={a.cameOnlineAtUtc ? 'Recovered (back online), still unacknowledged' : 'Offline (not yet recovered)'} /></td>
                <td><span className="dash-stack"><span className="dash-name">{dash(a.name)}</span>{a.hostname && <span className="dash-sub">{a.hostname}</span>}</span></td>
                <td className="mono nowrap">{dash(a.ip)}</td>
                <td><Conn type={a.connectionType} detail={a.connectionDetail} /></td>
                <td className="dash-hide-sm">{dash(a.upstream)}</td>
                <td className="dash-hide-sm">{dash(a.host)}</td>
                <td className="dash-hide-sm">{dash(a.location)}</td>
                <td className="dash-hide-sm">{dash(a.rack)}</td>
                <td className="nowrap dash-time">{absRel(a.wentOfflineAtUtc)}</td>
                <td className="nowrap dash-time">{a.cameOnlineAtUtc ? absRel(a.cameOnlineAtUtc) : '—'}</td>
                {canEdit && (
                  <td>
                    <div className="dash-actions">
                      <button className="btn primary sm" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, kind: 'ack' })}>Acknowledge</button>
                      <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, kind: 'ignore' })}
                        title="Stop tracking offline status for this device and acknowledge">Ignore offline</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ---------- firmware ---------- */
function FirmwarePanel({ d, canEdit, onDone }: { d: DashboardData; canEdit: boolean; onDone: () => void }) {
  const toast = useToast();
  const ack = useMutation({
    mutationFn: (id: number) => dashboardApi.ackFirmware(id),
    onSuccess: () => { toast('Firmware alert acknowledged'); onDone(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const rows: FirmwareAlert[] = d.firmwareAlerts;
  return (
    <Panel title="Firmware updates" count={d.totals.firmwareAlerts}>
      {rows.length === 0 ? <div className="dash-ok-note">No unacknowledged firmware updates.</div> : (
        <table className="table">
          <thead><tr><th>Device</th><th className="dash-hide-sm">MAC</th><th>Model</th><th>Current</th><th>Target</th><th>Detected</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="dash-name">{dash(a.name)}</td>
                <td className="mono dash-hide-sm">{dash(a.mac)}</td>
                <td>{dash(a.model)}</td>
                <td className="mono">{dash(a.current)}</td>
                <td className="mono">{dash(a.target)}</td>
                <td className="nowrap dash-time">{absRel(a.detectedAtUtc)}</td>
                {canEdit && <td><div className="dash-actions"><button className="btn primary sm" disabled={ack.isPending} onClick={() => ack.mutate(a.id)}>Acknowledge</button></div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ---------- critical devices ---------- */
function Timeline({ dev, startIso }: { dev: CriticalDevice; startIso: string }) {
  const start = parseUtc(startIso);
  const hours = Array.from({ length: 24 }, (_, i) => String(new Date(start.getTime() + i * 3600_000).getHours()).padStart(2, '0'));
  const summary = dev.timeline.length === 0 ? 'No status history in the last 24 hours'
    : dev.timeline.map((s) => `${s.kind} ${s.pct.toFixed(0)}%`).join(', ');
  return (
    <div className="dash-tl">
      <div className="dash-tl-bar" role="img" aria-label={`Last 24 hours: ${summary}`}>
        {dev.timeline.map((s, i) => <i key={i} className={s.kind} style={{ width: `${s.pct}%` }} />)}
      </div>
      <div className="dash-tl-hours" aria-hidden>{hours.map((h, i) => <span key={i}>{h}</span>)}</div>
      <div className="dash-tl-legend">
        <span><i style={{ background: 'var(--ok)' }} />Online</span>
        <span><i style={{ background: 'var(--bad)' }} />Offline</span>
        <span><i style={{ background: 'var(--muted)', opacity: .5 }} />Unknown</span>
        <span>Last 24 hours</span>
      </div>
    </div>
  );
}

function CriticalPanel({ d }: { d: DashboardData }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  return (
    <Panel title="Critical devices">
      {d.criticalDevices.length === 0 ? <div className="dash-note">No critical devices defined.</div> : (
        <table className="table">
          <thead>
            <tr>
              <th className="w1" /><th className="w1" /><th>Name</th><th className="dash-hide-sm">Type</th><th className="dash-hide-sm">Hostname</th><th>IP</th>
              <th className="dash-hide-sm">Subnet</th><th className="dash-hide-sm">MAC</th><th>Conn</th><th className="dash-hide-sm">Upstream</th>
              <th className="dash-hide-sm">Location</th><th className="dash-hide-sm">Rack</th>
            </tr>
          </thead>
          <tbody>
            {d.criticalDevices.map((c) => {
              const isOpen = open.has(c.id);
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td>
                      <button className="dash-toggle" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} 24-hour history for ${c.name}`} onClick={() => toggle(c.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                      </button>
                    </td>
                    <td><StatusDot tracked={c.isStatusTracked} online={c.isOnline} /></td>
                    <td className="dash-name">{c.accessLink ? <a href={c.accessLink} target="_blank" rel="noopener noreferrer">{c.name}</a> : c.name}</td>
                    <td className="dash-hide-sm">{dash(c.type)}</td>
                    <td className="dash-hide-sm">{dash(c.hostname)}</td>
                    <td className="mono nowrap">{dash(c.ip)}</td>
                    <td className="dash-hide-sm">{c.subnetId ? <a href={`/subnets/${c.subnetId}/ips`}>{c.subnet}</a> : '-'}</td>
                    <td className="mono dash-hide-sm">{dash(c.macAddress)}</td>
                    <td><Conn type={c.connectionType} detail={c.connectionDetail} /></td>
                    <td className="dash-hide-sm">{dash(c.upstream)}</td>
                    <td className="dash-hide-sm">{dash(c.location)}</td>
                    <td className="dash-hide-sm">{dash(c.rack)}</td>
                  </tr>
                  {isOpen && <tr className="dash-tl-row"><td colSpan={12}><Timeline dev={c} startIso={d.windowStartUtc} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ---------- discovery ---------- */
function AddModal({ alert, d, onClose, onSubmit, busy }: {
  alert: DiscoveryAlert; d: DashboardData; onClose: () => void; busy: boolean;
  onSubmit: (b: { name: string; hostname: string; clientTypeId: number | null; upstreamDeviceName: string; upstreamConnection: string }) => void;
}) {
  const [name, setName] = useState(alert.name ?? alert.mac);
  const [hostname, setHostname] = useState(alert.hostname ?? '');
  const [typeId, setTypeId] = useState('');
  const [up, setUp] = useState(alert.upstream ?? '');
  const [upConn, setUpConn] = useState(alert.upstreamConnection ?? '');
  const err = name.trim() ? null : 'Name is required';
  return (
    <Modal title="Add discovered device" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !!err}
          onClick={() => onSubmit({ name, hostname, clientTypeId: typeId ? Number(typeId) : null, upstreamDeviceName: up, upstreamConnection: upConn })}>
          {busy ? 'Adding…' : 'Add device'}
        </button>
      </>}>
      <div className="form-grid">
        <Field label="Name" error={err}><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Hostname"><TextInput value={hostname} onChange={(e) => setHostname(e.target.value)} /></Field>
        <Field label="MAC address"><TextInput value={alert.mac} disabled readOnly /></Field>
        <Field label="IP address"><TextInput value={alert.ip ?? ''} disabled readOnly /></Field>
        <Field label="Type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">(none)</option>
            {d.clientTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <span />
        <Field label="Upstream device"><TextInput value={up} onChange={(e) => setUp(e.target.value)} /></Field>
        <Field label="Upstream connection"><TextInput value={upConn} onChange={(e) => setUpConn(e.target.value)} placeholder="port or SSID" /></Field>
      </div>
    </Modal>
  );
}

function DiscoveryPanel({ d, canEdit, onDone }: { d: DashboardData; canEdit: boolean; onDone: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<DiscoveryAlert | null>(null);
  const add = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof dashboardApi.addDiscovery>[1] }) => dashboardApi.addDiscovery(id, body),
    onSuccess: () => { toast('Device added'); setEditing(null); onDone(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const ignore = useMutation({
    mutationFn: (id: number) => dashboardApi.ignoreDiscovery(id),
    onSuccess: () => { toast('Device ignored'); onDone(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const busy = add.isPending || ignore.isPending;
  const rows = d.discoveryAlerts;
  return (
    <Panel title="New clients/devices" count={d.totals.discoveryAlerts} more={{ href: '/alerts/discovery', label: 'More…' }}>
      {rows.length === 0 ? <div className="dash-ok-note">No unacknowledged discovery alerts.</div> : (
        <table className="table">
          <thead><tr><th>Client</th><th>IP</th><th>Conn</th><th className="dash-hide-sm">Upstream</th><th>Detected</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td><span className="dash-stack"><span className="dash-name">{dash(a.name)}</span>{a.hostname && <span className="dash-sub">{a.hostname}</span>}<span className="dash-sub mono">{a.mac}</span></span></td>
                <td className="mono nowrap">{dash(a.ip)}</td>
                <td>{dash(a.connectionType)}</td>
                <td className="dash-hide-sm">{dash(a.upstream)}</td>
                <td className="nowrap dash-time">{absRel(a.detectedAtUtc)}</td>
                {canEdit && (
                  <td>
                    <div className="dash-actions">
                      <button className="btn primary sm" disabled={busy} onClick={() => add.mutate({ id: a.id, body: {} })}>Add</button>
                      <button className="btn sm" disabled={busy} onClick={() => setEditing(a)}>Edit &amp; add</button>
                      <button className="btn sm" disabled={busy} onClick={() => ignore.mutate(a.id)} style={{ color: 'var(--bad)' }}>Ignore</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <AddModal alert={editing} d={d} busy={add.isPending} onClose={() => setEditing(null)}
          onSubmit={(b) => add.mutate({ id: editing.id, body: {
            name: b.name.trim(), hostname: b.hostname.trim(), clientTypeId: b.clientTypeId,
            upstreamDeviceName: b.upstreamDeviceName.trim(), upstreamConnection: b.upstreamConnection.trim(),
          } })} />
      )}
    </Panel>
  );
}

/* ---------- subnets overview ---------- */
function Overview({ subnets }: { subnets: SubnetCard[] }) {
  return (
    <Panel title="Subnets overview">
      {subnets.length === 0 ? <div className="dash-note">No subnets found.</div> : (
        <table className="table">
          <thead>
            <tr><th>Subnet</th><th>CIDR</th><th className="r">Usable</th><th className="r">Used IPs</th><th className="r">Available</th><th className="r dash-hide-sm">Clients</th><th className="r dash-hide-sm">Devices</th><th className="r">Offline</th></tr>
          </thead>
          <tbody>
            {subnets.map((r) => (
              <tr key={r.id}>
                <td className="strong"><a href={`/subnets/${r.id}/ips`}>{r.name}</a></td>
                <td className="mono"><a href={`/subnets/${r.id}/ips`}>{r.cidr}</a></td>
                <td className="r num">{r.usable}</td>
                <td className="r num">{r.used}</td>
                <td className="r num">{r.free}</td>
                <td className="r num dash-hide-sm">{r.clients}</td>
                <td className="r num dash-hide-sm">{r.devices}</td>
                <td className="r num">{r.offline > 0 ? <a href={`/subnets/${r.id}/clients/offline`}><Badge tone="bad">{r.offline}</Badge></a> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ---------- page ---------- */
export default function Dashboard() {
  const qc = useQueryClient();
  const { edit } = useCan();
  const [interval, setIntervalMs] = useState<number | false>(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const r = await dashboardApi.get();
      const s = r.settings.autoRefreshSeconds;
      setIntervalMs(s > 0 ? Math.min(3600, Math.max(5, s)) * 1000 : false);
      return r;
    },
    refetchInterval: interval,
  });
  const onDone = () => qc.invalidateQueries({ queryKey: ['dashboard'] });

  const u = data?.updater;
  const sub = data ? (
    <span className="dash-updated">
      Last update: {u?.lastRunUtc ? fmtDate(u.lastRunUtc, data.settings.dateFormat) : '—'}
      {u?.lastError ? <span className="bad-text"> • Error: {u.lastError}</span> : u?.lastRunUtc ? ` • Changed: ${u.lastChangedCount}` : ''}
    </span>
  ) : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={<>
          {sub}
          <button className="btn ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh dashboard">{isFetching ? 'Refreshing…' : 'Refresh'}</button>
        </>}
      />
      {isLoading && <Spinner label="Loading dashboard…" />}
      {error && <ErrorNote error={error} />}
      {data && (
        <div className="dash">
          {data.totals.clients + data.totals.devices === 0 && <Welcome />}
          <Hero d={data} />
          <Networks subnets={data.subnets} />
          <div className="dash-panels">
            <OfflinePanel d={data} canEdit={edit} onDone={onDone} />
            <FirmwarePanel d={data} canEdit={edit} onDone={onDone} />
            <CriticalPanel d={data} />
            <DiscoveryPanel d={data} canEdit={edit} onDone={onDone} />
            <Overview subnets={data.subnets} />
          </div>
        </div>
      )}
    </>
  );
}
