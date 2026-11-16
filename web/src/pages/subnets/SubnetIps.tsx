import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subnetsApi, type IpDevice, type IpRow, type IpStatus } from './api';
import { useCan } from '../../auth';
import { PageHeader, Stat, Empty } from '../../components/ui';
import {
  Modal, Field, Select, Textarea, Switch, Badge, Spinner, ErrorNote, useToast, useDebounced, timeAgo,
} from '../../components/kit';

type ViewMode = 'all' | 'used' | 'available' | 'reserved' | 'deprecated' | 'dhcp';
const MAP_MAX = 2048;

const STATUS_LABEL: Record<IpStatus, string> = {
  available: 'Available', reserved: 'Reserved', dhcp: 'DHCP', deprecated: 'Deprecated',
  assignedStatic: 'Assigned (static)', assignedDhcp: 'Assigned (DHCP)',
};
const STATUS_TONE: Record<IpStatus, 'neutral' | 'ok' | 'warn' | 'bad' | 'info'> = {
  available: 'neutral', reserved: 'warn', dhcp: 'info', deprecated: 'bad', assignedStatic: 'neutral', assignedDhcp: 'info',
};

function cellClass(r: IpRow) {
  if (r.isUsed && !r.online) return 'c-offline';
  switch (r.status) {
    case 'assignedStatic': return 'c-static';
    case 'assignedDhcp': return 'c-dhcpused';
    case 'reserved': return 'c-reserved';
    case 'dhcp': return 'c-dhcp';
    case 'deprecated': return 'c-deprecated';
    default: return 'c-free';
  }
}
const lastOctet = (ip: string) => ip.slice(ip.lastIndexOf('.') + 1);
const has = (v: string | null | undefined, n: string) => !!v && v.toLowerCase().includes(n);

function wifiTone(detail: string | null): 'warn' | 'ok' | 'info' | 'neutral' {
  if (!detail) return 'neutral';
  const d = detail.toLowerCase();
  if (d.includes('2.4') || d.includes('2g')) return 'warn';
  if (d.includes('6')) return 'ok';
  return 'info';
}
function connLabel(d: IpDevice) {
  const t = (d.connectionType ?? '').trim();
  if (!t) return null;
  const detail = (d.hosted ? 'Hosted' : d.upstreamConnection) ?? d.connectionDetail;
  return { label: t.toLowerCase() === 'wifi' ? 'WiFi' : t, title: detail ? `${t} | ${detail}` : t, tone: t.toLowerCase() === 'wifi' ? wifiTone(d.connectionDetail) : 'neutral' as const };
}
function Conn({ d }: { d: IpDevice }) {
  const c = connLabel(d);
  return c ? <span title={c.title}><Badge tone={c.tone}>{c.label}</Badge></span> : <span className="muted">—</span>;
}
function absRel(iso: string | null) {
  if (!iso) return '—';
  return `${new Date(iso).toLocaleString()} (${timeAgo(iso)})`;
}
function rowTooltip(r: IpRow) {
  if (!r.isUsed) return 'Free';
  const seen = r.devices.map((d) => d.lastSeenAt).filter(Boolean).sort().pop() ?? null;
  const online = r.devices.map((d) => d.lastOnlineAt).filter(Boolean).sort().pop() ?? null;
  const lines = [r.online ? 'Online' : 'Offline', `Last seen: ${absRel(seen)}`];
  if (!r.online && online && (!seen || Math.abs(+new Date(seen) - +new Date(online)) >= 2000)) lines.push(`Last online: ${absRel(online)}`);
  return lines.join('\n');
}
function mapTitle(r: IpRow) {
  if (r.isUsed) {
    const mac = r.devices.find((d) => d.macAddress)?.macAddress;
    return `${r.ip} — ${r.devices.map((d) => d.name).join(', ')}${mac ? ` (${mac})` : ''}${r.online ? '' : ' [offline]'}`;
  }
  const note = r.reservation?.notes;
  return `${r.ip} — ${STATUS_LABEL[r.status]}${note ? `: ${note}` : ''}`;
}

function StatusCell({ r, tips }: { r: IpRow; tips: boolean }) {
  const assigned = r.isUsed;
  return (
    <span className="subnets-status">
      <span className={'dot ' + (assigned ? (r.online ? 'on' : 'down') : '')} title={assigned && tips ? rowTooltip(r) : undefined}
        style={!assigned ? { background: r.status === 'reserved' ? 'var(--warn)' : r.status === 'deprecated' ? 'var(--bad)' : r.status === 'dhcp' ? 'var(--info)' : undefined } : undefined} />
      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
    </span>
  );
}

function Stack<T>({ items, render }: { items: T[]; render: (t: T) => React.ReactNode }) {
  if (items.length === 1) return <>{render(items[0])}</>;
  return <div className="subnets-stack">{items.map((t, i) => <div key={i}>{render(t)}</div>)}</div>;
}
const dash = <span className="muted">—</span>;

function ReservationForm({ subnetId, row, onClose }: { subnetId: number; row: IpRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState(row.reservation?.status ?? 'Available');
  const [notes, setNotes] = useState(row.reservation?.notes ?? '');
  const save = useMutation({
    mutationFn: () => subnetsApi.saveReservation(subnetId, { ip: row.ip, status, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subnets'] }); toast(`${row.ip} updated`); onClose(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="subnets-form">
      <Field label="Status">
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={save.isPending}>
          <option value="Available">Available (clear)</option>
          <option value="Reserved">Reserved</option>
          <option value="DHCP">DHCP</option>
          <option value="Deprecated">Deprecated</option>
        </Select>
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={save.isPending} />
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
        <button type="submit" className="btn primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

function IpDetail({ subnetId, row, canEdit, tips, onClose }: { subnetId: number; row: IpRow; canEdit: boolean; tips: boolean; onClose: () => void }) {
  return (
    <Modal title={row.ip} onClose={onClose} wide={row.isUsed}>
      <div className="subnets-detail">
        <div className="row"><StatusCell r={row} tips={tips} />{row.inDhcp && <Badge tone="info">in DHCP range</Badge>}</div>
        {row.devices.map((d) => (
          <section key={d.id} className="subnets-dev">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="strong">
                {d.accessHref ? <a href={d.accessHref} target="_blank" rel="noopener noreferrer">{d.name}</a> : d.name}
              </span>
              <Badge tone={!d.isStatusTracked ? 'neutral' : d.isOnline ? 'ok' : 'bad'}>{!d.isStatusTracked ? 'Not tracked' : d.isOnline ? 'Online' : 'Offline'}</Badge>
            </div>
            <dl>
              <dt>IP</dt><dd className="mono">{d.ipDisplay}</dd>
              <dt>Type</dt><dd>{d.type ?? '—'}{d.type && <span className="muted"> · {d.isDevice ? 'device' : 'client'}</span>}</dd>
              <dt>Hostname</dt><dd>{d.hostname ?? '—'}</dd>
              <dt>MAC</dt><dd className="mono">{d.macAddress ?? '—'}</dd>
              <dt>Connection</dt><dd><Conn d={d} /> {d.connectionDetail && <span className="muted">{d.connectionDetail}</span>}</dd>
              <dt>Upstream</dt><dd>{[d.hosted ? 'Hosted' : d.upstreamDeviceName, d.hosted ? null : d.upstreamConnection].filter(Boolean).join(' | ') || '—'}</dd>
              <dt>Last seen</dt><dd>{absRel(d.lastSeenAt)}</dd>
              <dt>Last online</dt><dd>{absRel(d.lastOnlineAt)}</dd>
            </dl>
            <div><Link to={`/devices?q=${encodeURIComponent(d.name)}`} className="small">Find in {d.isDevice ? 'devices' : 'clients'}</Link></div>
          </section>
        ))}
        {!row.isUsed && (canEdit ? (
          <ReservationForm subnetId={subnetId} row={row} onClose={onClose} />
        ) : (
          <div>{row.reservation?.notes || <span className="muted">No reservation notes.</span>}</div>
        ))}
        {row.isUsed && row.reservation?.notes && <div><span className="muted small">Reservation notes</span><div>{row.reservation.notes}</div></div>}
      </div>
    </Modal>
  );
}

export default function SubnetIpsPage() {
  const id = Number(useParams().id);
  const { edit } = useCan();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const [view, setView] = useState<ViewMode>('all');
  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(true);
  const [hideDhcp, setHideDhcp] = useState(false);
  const [map, setMap] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['subnets', 'ips', id],
    queryFn: () => subnetsApi.ips(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => {
      const s = query.state.data?.options.autoRefreshSeconds ?? 0;
      return s > 0 ? Math.min(3600, Math.max(5, s)) * 1000 : false;
    },
  });

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => {
    const s = dq.trim().toLowerCase();
    return rows.filter((r) => {
      switch (view) {
        case 'used': if (!r.isUsed) return false; break;
        case 'available': if (r.isUsed || r.status !== 'available') return false; break;
        case 'reserved': if (r.isUsed || r.status !== 'reserved') return false; break;
        case 'deprecated': if (r.isUsed || r.status !== 'deprecated') return false; break;
        case 'dhcp': if (!(r.status === 'dhcp' || (r.isUsed && r.inDhcp))) return false; break;
      }
      if (r.isUsed && !((showOnline && r.online) || (showOffline && !r.online))) return false;
      if (hideDhcp && (r.status === 'dhcp' || r.inDhcp)) return false;
      if (s && !(has(r.ip, s) || r.devices.some((d) =>
        has(d.name, s) || has(d.hostname, s) || has(d.macAddress, s) || has(d.connectionType, s) || has(d.connectionDetail, s)
        || has(d.upstreamDeviceName, s) || has(d.upstreamConnection, s)))) return false;
      return true;
    });
  }, [rows, dq, view, showOnline, showOffline, hideDhcp]);
  const visible = useMemo(() => new Set(filtered.map((r) => r.ip)), [filtered]);

  if (!Number.isFinite(id)) return <Empty>Subnet not found.</Empty>;
  if (isLoading) return <Spinner />;
  if (error) return (
    <>
      <Link to="/subnets" className="subnets-back">← Subnets</Link>
      <ErrorNote error={error} />
    </>
  );
  if (!data) return null;

  const { subnet, options } = data;
  const used = rows.filter((r) => r.isUsed).length;
  const pct = rows.length ? (used * 100) / rows.length : 0;
  const selRow = sel ? rows.find((r) => r.ip === sel) ?? null : null;
  const tips = options.showTooltips;

  const meta = [
    subnet.vlanId ? `VLAN ${subnet.vlanId}` : null,
    data.usableRange ? `usable ${data.usableRange}` : null,
    subnet.dhcpRangeStart && subnet.dhcpRangeEnd ? `DHCP ${subnet.dhcpRangeStart} – ${subnet.dhcpRangeEnd}` : null,
    subnet.dns1 ? `DNS ${[subnet.dns1, subnet.dns2].filter(Boolean).join(' | ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <Link to="/subnets" className="subnets-back">← Back to subnets</Link>
      <PageHeader
        title={`${subnet.name} · ${subnet.cidr}`}
        sub={[subnet.description, meta].filter(Boolean).join(' — ') || undefined}
        actions={<a className="btn ghost" href={`/export/subnets/${subnet.id}/ips.xlsx`}>Export subnet</a>}
      />

      {data.error ? (
        <div className="error" role="alert">{data.error}</div>
      ) : rows.length === 0 ? (
        <Empty>No usable IPs for this subnet.</Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="Usable IPs" value={rows.length} />
            <Stat label="Used" value={used} tone="info" />
            <Stat label="Free" value={rows.length - used} />
            <Stat label="Offline" value={rows.filter((r) => r.isUsed && !r.online).length} tone="bad" />
          </div>

          <div className="subnets-filters">
            <input className="search" aria-label="Search IPs" placeholder="Search IP, name, hostname, MAC, connection…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select aria-label="View" value={view} onChange={(e) => setView(e.target.value as ViewMode)}>
              <option value="all">All</option><option value="used">Used</option><option value="available">Available</option>
              <option value="reserved">Reserved</option><option value="deprecated">Deprecated</option><option value="dhcp">DHCP</option>
            </Select>
            <Switch checked={showOnline} onChange={setShowOnline} label="Online" />
            <Switch checked={showOffline} onChange={setShowOffline} label="Offline" />
            <Switch checked={hideDhcp} onChange={setHideDhcp} label="Hide DHCP" />
            <div className="seg" role="group" aria-label="View mode">
              <button className={map ? 'on' : ''} onClick={() => setMap(true)} aria-pressed={map}>map</button>
              <button className={!map ? 'on' : ''} onClick={() => setMap(false)} aria-pressed={!map}>table</button>
            </div>
          </div>

          {map ? (
            <div className="card">
              <div className="subnets-legend">
                {([['c-static', 'Static'], ['c-dhcpused', 'DHCP lease'], ['c-offline', 'Assigned, offline'], ['c-reserved', 'Reserved'],
                  ['c-dhcp', 'DHCP pool'], ['c-deprecated', 'Deprecated'], ['c-free', 'Free']] as const).map(([c, l]) => (
                  <span key={c}><i className={`subnets-sw ${c}`} />{l}</span>
                ))}
                <span className="pct num">{pct.toFixed(1).replace(/\.0$/, '')}% used</span>
              </div>
              {rows.length > MAP_MAX ? (
                <div className="muted">
                  This subnet has {rows.length.toLocaleString()} addresses; the map is limited to {MAP_MAX.toLocaleString()}. Use the table view or narrow with search.
                </div>
              ) : (
                <div className="subnets-map">
                  {rows.map((r) => (
                    <button
                      key={r.ip} type="button" title={mapTitle(r)} aria-label={mapTitle(r)}
                      className={`subnets-cell ${cellClass(r)}${visible.has(r.ip) ? '' : ' dim'}`}
                      onClick={() => setSel(r.ip)}
                    >{lastOctet(r.ip)}</button>
                  ))}
                </div>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>No IPs match your filters.</Empty>
          ) : (
            <div className="card flush">
              <table className="table subnets-ips">
                <thead>
                  <tr><th>IP</th><th>Status</th><th>Notes</th><th>Name</th><th>Type</th><th>Hostname</th><th>MAC</th><th>Conn</th><th>Upstream</th>{edit && <th />}</tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.ip}>
                      <td className="mono">
                        {r.isUsed
                          ? <Stack items={r.devices} render={(d) => d.ipDisplay} />
                          : <button className="btn link-btn mono" onClick={() => setSel(r.ip)}>{r.ip}</button>}
                      </td>
                      <td><StatusCell r={r} tips={tips} /></td>
                      <td className="subnets-note small">{r.reservation?.notes || dash}</td>
                      {r.isUsed ? (
                        <>
                          <td><Stack items={r.devices} render={(d) => d.accessHref
                            ? <a className="strong" href={d.accessHref} target="_blank" rel="noopener noreferrer">{d.name}</a>
                            : <span className="strong">{d.name}</span>} /></td>
                          <td><Stack items={r.devices} render={(d) => d.type ?? dash} /></td>
                          <td><Stack items={r.devices} render={(d) => d.hostname ?? dash} /></td>
                          <td className="mono small"><Stack items={r.devices} render={(d) => d.macAddress ?? dash} /></td>
                          <td>
                            {new Set(r.devices.map((d) => (d.connectionType ?? '').trim().toLowerCase()).filter(Boolean)).size > 1
                              ? <Badge tone="bad">DUP</Badge>
                              : <Stack items={r.devices} render={(d) => <Conn d={d} />} />}
                          </td>
                          <td className="small"><Stack items={r.devices} render={(d) => d.connectionDetail ?? dash} /></td>
                        </>
                      ) : (
                        <><td>{dash}</td><td>{dash}</td><td>{dash}</td><td>{dash}</td><td>{dash}</td><td>{dash}</td></>
                      )}
                      {edit && (
                        <td>
                          <div className="row-actions">
                            {r.isUsed
                              ? <button className="btn sm" onClick={() => setSel(r.ip)}>Details</button>
                              : (
                                <>
                                  <button className="btn sm" onClick={() => setSel(r.ip)} aria-label={`Edit reservation for ${r.ip}`}>Reserve</button>
                                                                    
                                </>
                              )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selRow && <IpDetail subnetId={id} row={selRow} canEdit={edit} tips={tips} onClose={() => setSel(null)} />}
    </>
  );
}
