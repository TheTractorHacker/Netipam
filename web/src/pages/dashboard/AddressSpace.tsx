import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { subnetsApi, type IpBlock, type IpRow, type IpStatus } from '../subnets/api';
import type { SubnetCard } from './api';
import { Badge, useToast } from '../../components/kit';
import { Empty } from '../../components/ui';
import { useCan } from '../../auth';
import './addressSpace.css';

const MAX_CELLS = 1024;
const LABEL: Record<IpStatus, string> = {
  available: 'Free', reserved: 'Reserved', dhcp: 'DHCP pool', deprecated: 'Deprecated',
  assignedStatic: 'In use (static)', assignedDhcp: 'In use (DHCP)',
};

function kind(r: IpRow): string {
  if (r.isUsed) return r.online ? 'on' : 'off';
  if (r.status === 'reserved') return 'res';
  if (r.status === 'dhcp') return 'dhcp';
  if (r.status === 'deprecated') return 'dep';
  return 'free';
}
const tail = (ip: string) => ip.slice(ip.lastIndexOf('.') + 1);

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}

function blockKind(b: IpBlock): string {
  if (b.offline > 0) return 'off';
  const pct = b.usable > 0 ? (b.used + b.reserved) / b.usable : 0;
  return pct >= 0.9 ? 'hi' : pct >= 0.5 ? 'mid' : pct > 0 ? 'lo' : 'free';
}

interface Pick { subnetId: number; ip: string }

export default function AddressSpace({ subnets, refetchMs }: { subnets: SubnetCard[]; refetchMs: number | false }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const { edit } = useCan();
  const [pick, setPick] = useState<Pick | null>(null);
  const [only, setOnly] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...subnets].sort((a, b) => (a.vlanId ?? 1e9) - (b.vlanId ?? 1e9) || a.name.localeCompare(b.name)),
    [subnets]);
  const maps = useQueries({
    queries: sorted.map((s) => ({
      queryKey: ['subnet-ips', s.id],
      queryFn: () => subnetsApi.ips(s.id),
      enabled: true,
      refetchInterval: refetchMs,
      staleTime: 15_000,
    })),
  });

  const reserve = useMutation({
    mutationFn: (v: { id: number; ip: string; status: string }) =>
      subnetsApi.saveReservation(v.id, { ip: v.ip, status: v.status, notes: '' }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['subnet-ips', v.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['subnets'] });
      toast(v.status === 'Available' ? `${v.ip} released` : `${v.ip} reserved`);
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  if (sorted.length === 0)
    return <Empty>No subnets yet. <Link to="/subnets">Add one</Link> and its address space appears here.</Empty>;

  const idx = pick ? sorted.findIndex((s) => s.id === pick.subnetId) : -1;
  const row: IpRow | undefined = idx >= 0 ? maps[idx]?.data?.rows.find((r) => r.ip === pick!.ip) : undefined;
  const dev = row?.devices[0];

  return (
    <section className="as" aria-labelledby="as-h">
      <div className="as-head">
        <h2 id="as-h">Address space</h2>
        <div className="as-legend" role="group" aria-label="Filter by state">
          {([['free', 'Free'], ['on', 'Online'], ['off', 'Offline'], ['res', 'Reserved'], ['dhcp', 'DHCP']] as const).map(([k, l]) => (
            <button key={k} type="button" className={'as-key' + (only === k ? ' active' : '')} aria-pressed={only === k}
              onClick={() => setOnly(only === k ? null : k)}>
              <i className={`as-sw ${k}`} />{l}
            </button>
          ))}
        </div>
      </div>

      <div className={'as-body' + (row ? ' has-pick' : '')}>
        <div className="as-subnets">
          {sorted.map((s, i) => {
            const q = maps[i];
            const rows = s.usable > MAX_CELLS ? undefined : q?.data?.rows;
            const pct = s.usable > 0 ? Math.round((s.used * 100) / s.usable) : 0;
            const nextFree = rows?.find((r) => !r.isUsed && r.status === 'available')?.ip;
            return (
              <article key={s.id} className="as-net" aria-label={`${s.name} ${s.cidr}`}>
                <header className="as-net-head">
                  <div className="as-net-title">
                    <Link to={`/subnets/${s.id}/ips`} className="as-net-name">{s.name}</Link>
                    <span className="as-net-cidr mono">{s.cidr}</span>
                    {s.vlanId !== null && <Badge>VLAN {s.vlanId}</Badge>}
                  </div>
                  <div className="as-net-meta">
                    <span className={'as-pct' + (pct >= 90 ? ' crit' : pct >= 75 ? ' warn' : '')}><b>{s.free}</b> free · {pct}% used</span>
                    {s.offline > 0 && <Badge tone="bad">{s.offline} offline</Badge>}
                    {nextFree && (
                      <button type="button" className="btn ghost sm" onClick={async () => toast((await copy(nextFree)) ? `Copied ${nextFree}` : `Next free: ${nextFree}`)}>
                        Copy next free
                      </button>
                    )}
                  </div>
                </header>
                {s.usable > MAX_CELLS ? (
                  q?.isError ? <div className="as-big bad-text">Could not load this subnet.</div>
                  : !q?.data ? <div className="as-skel" aria-hidden />
                  : q.data.error ? <div className="as-big muted">{q.data.error} <Link to={`/subnets/${s.id}/ips`}>Open its list</Link>.</div>
                  : (
                    <>
                      <div className="as-blocks-sum muted">
                        {(q.data.blocks ?? []).reduce((a, b) => a + b.used, 0).toLocaleString()} used across {(q.data.blocks ?? []).length} blocks
                      </div>
                      <div className="as-strip" role="list">
                        {(q.data.blocks ?? []).map((b) => (
                          <button key={b.cidr} type="button" role="listitem" className={`as-cell as-block ${blockKind(b)}`}
                            title={`${b.cidr} - ${b.used} used, ${b.offline} offline`}
                            aria-label={`${b.cidr}, ${b.used} used, ${b.offline} offline`}
                            onClick={() => nav(`/subnets/${s.id}/ips?block=${encodeURIComponent(b.cidr)}`)}>
                            <span>{b.cidr.split('.')[2]}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )
                ) : q?.isError ? (
                  <div className="as-big bad-text">Could not load this subnet.</div>
                ) : !rows ? (
                  <div className="as-skel" aria-hidden />
                ) : (
                  <div className="as-strip" role="list">
                    {rows.map((r) => {
                      const k = kind(r);
                      const sel = pick?.ip === r.ip && pick.subnetId === s.id;
                      return (
                        <button key={r.ip} type="button" role="listitem"
                          className={`as-cell ${k}${sel ? ' sel' : ''}${only && only !== k ? ' dim' : ''}`}
                          aria-label={`${r.ip}, ${r.isUsed ? r.devices.map((d) => d.name).join(', ') + (r.online ? ', online' : ', offline') : LABEL[r.status]}`}
                          title={`${r.ip}${r.isUsed ? ' — ' + r.devices.map((d) => d.name).join(', ') : ' — ' + LABEL[r.status]}`}
                          onClick={() => setPick(sel ? null : { subnetId: s.id, ip: r.ip })}>
                          <span>{tail(r.ip)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {row && pick && (
          <aside className="as-inspect" aria-label={`Details for ${row.ip}`}>
            <div className="as-ins-head">
              <div>
                <div className="as-ins-ip mono">{row.ip}</div>
                <div className="muted">{sorted[idx].name} · {LABEL[row.status]}</div>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setPick(null)} aria-label="Close details">Close</button>
            </div>

            {dev ? (
              <div className="as-ins-dev">
                <div className="as-ins-name">{dev.name}</div>
                <div className="as-ins-badges">
                  <Badge tone={row.online ? 'ok' : 'bad'}>{row.online ? 'Online' : 'Offline'}</Badge>
                  {dev.type && <Badge>{dev.type}</Badge>}
                  {dev.connectionType && <Badge tone="info">{dev.connectionType}</Badge>}
                </div>
                <dl>
                  {dev.hostname && <><dt>Hostname</dt><dd>{dev.hostname}</dd></>}
                  {dev.macAddress && <><dt>MAC</dt><dd className="mono">{dev.macAddress}</dd></>}
                  {dev.upstreamDeviceName && <><dt>Upstream</dt><dd>{dev.upstreamDeviceName}</dd></>}
                </dl>
                {row.devices.length > 1 && <div className="muted">+{row.devices.length - 1} more device(s) share this IP</div>}
              </div>
            ) : row.reservation ? (
              <div className="as-ins-dev">{row.reservation.notes ? row.reservation.notes : <span className="muted">No note on this reservation.</span>}</div>
            ) : (
              <div className="as-ins-dev muted">Nothing is using this address.</div>
            )}

            <div className="as-ins-actions">
              <button type="button" className="btn sm" onClick={async () => toast((await copy(row.ip)) ? `Copied ${row.ip}` : row.ip)}>Copy IP</button>
              {dev && <Link className="btn sm" to={`/${dev.isDevice ? 'devices' : 'clients'}?open=${dev.id}`}>Open {dev.isDevice ? 'device' : 'client'}</Link>}
              {dev?.accessHref && <a className="btn sm" href={dev.accessHref} target="_blank" rel="noopener noreferrer">Open access link</a>}
              {edit && !row.isUsed && row.status === 'available' && (
                <>
                  <Link className="btn primary sm" to={`/clients?add=client&ip=${row.ip}`}>Assign to a client</Link>
                  <button type="button" className="btn sm" disabled={reserve.isPending}
                    onClick={() => reserve.mutate({ id: pick.subnetId, ip: row.ip, status: 'Reserved' })}>Reserve</button>
                </>
              )}
              {edit && !row.isUsed && row.status === 'reserved' && (
                <button type="button" className="btn sm" disabled={reserve.isPending}
                  onClick={() => reserve.mutate({ id: pick.subnetId, ip: row.ip, status: 'Available' })}>Release</button>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
