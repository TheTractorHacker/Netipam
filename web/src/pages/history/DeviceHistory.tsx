import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ErrorNote, Spinner } from '../../components/kit';
import { ApiError } from '../../http';
import { fmtDateTime, historyApi, serverZoneName, type DailyRow, type Segment } from './api';
import './history.css';

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtDay(d: string) {
  const [y, m, day] = d.split('-');
  return `${m}-${day}-${y}`;
}

function UptimeChart({ rows }: { rows: DailyRow[] }) {
  const W = 800, H = 260, L = 40, R = 12, T = 12, B = 28;
  const x = (i: number) => L + (i * (W - L - R)) / (rows.length - 1);
  const y = (p: number) => T + ((100 - p) * (H - T - B)) / 100;
  const pts = rows.map((r, i) => `${x(i)},${y(r.percent)}`).join(' ');
  const step = Math.ceil(rows.length / 8);
  return (
    <svg className="history-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily uptime percentage, last 30 days">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text className="axis" x={L - 6} y={y(t) + 4} textAnchor="end">{t}%</text>
        </g>
      ))}
      <polyline className="line" points={pts} />
      {rows.map((r, i) => (
        <g key={r.date}>
          <circle className={'pt' + (r.percent < 90 ? ' low' : '')} cx={x(i)} cy={y(r.percent)} r={3.5}>
            <title>{`${fmtDay(r.date)}: ${r.percent.toFixed(1)}%`}</title>
          </circle>
          {i % step === 0 && <text className="axis" x={x(i)} y={H - 8} textAnchor="middle">{r.date.slice(5)}</text>}
        </g>
      ))}
    </svg>
  );
}

function Timeline({ segments }: { segments: Segment[] }) {
  const label: Record<Segment['kind'], string> = { online: 'Online', offline: 'Offline', unknown: 'No data' };
  return (
    <div className="history-tl">
      <div className="history-tl-bar">
        {segments.map((s, i) => (
          <i key={i} className={s.kind} style={{ width: `${(s.minutes * 100) / 1440}%` }}
             title={`${label[s.kind]} · ${fmtDuration(s.minutes * 60)}`} />
        ))}
      </div>
      <div className="history-tl-hours" aria-hidden>
        {Array.from({ length: 24 }, (_, h) => <span key={h}>{String(h).padStart(2, '0')}</span>)}
      </div>
    </div>
  );
}

export default function DeviceHistoryPage() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ['device-history', id], queryFn: () => historyApi.device(id), enabled: Number.isFinite(id) });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (d: string) => setOpen((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });

  if (q.isLoading) return <Spinner />;
  if (q.error) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return (
      <>
        <PageHeader title="Device History" />
        {nf ? <Empty>Device not found.</Empty> : <ErrorNote error={q.error} />}
      </>
    );
  }
  const d = q.data!;
  const back = d.device.isDevice ? '/devices' : '/clients';

  return (
    <>
      <Link to={back} className="history-back">← Back to {d.device.isDevice ? 'devices' : 'clients'}</Link>
      <PageHeader title={d.device.name} sub={`Device history${d.device.clientType ? ` · ${d.device.clientType}` : ''} · Times in ${serverZoneName() ?? 'local time'}`} />

      <div className="card">
        <h2>Daily uptime (last 30 days)</h2>
        {d.daily.length === 0 ? <p className="muted">No data yet.</p> : (
          <>
            {d.daily.length < 2
              ? <p className="muted">Chart will appear after at least 2 days of history.</p>
              : <UptimeChart rows={d.daily} />}
          </>
        )}
      </div>

      {d.daily.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr><th className="w1"><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Expand</span></th>
                <th>Date</th><th>Online</th><th>Offline</th><th>Uptime %</th></tr>
            </thead>
            <tbody>
              {[...d.daily].reverse().map((r) => {
                const isOpen = open.has(r.date);
                return (
                  <Fragment key={r.date}>
                    <tr>
                      <td>
                        <button className="history-exp" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} timeline for ${fmtDay(r.date)}`} onClick={() => toggle(r.date)}>
                          {isOpen ? '▾' : '▸'}
                        </button>
                      </td>
                      <td className="num">{fmtDay(r.date)}</td>
                      <td className="num">{fmtDuration(r.onlineSeconds)}</td>
                      <td className="num">{fmtDuration(r.offlineSeconds)}</td>
                      <td className="num">
                        <Badge tone={r.percent >= 99 ? 'ok' : r.percent >= 90 ? 'warn' : 'bad'}>{r.percent.toFixed(1)}%</Badge>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={5}><Timeline segments={d.timelines[r.date] ?? []} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="history-legend" style={{ padding: '0 14px 12px' }}>
            <span><i style={{ background: 'var(--ok)' }} />Online</span>
            <span><i style={{ background: 'var(--bad)' }} />Offline</span>
            <span><i style={{ background: 'var(--muted)', opacity: .45 }} />No data</span>
          </div>
        </div>
      )}

      <h2 className="section-gap">Status events (last 30 days)</h2>
      {d.events.length === 0 ? <Empty>No status changes recorded.</Empty> : (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>Time</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {d.events.map((e) => (
                <tr key={e.id}>
                  <td className="num">{fmtDateTime(e.at)}</td>
                  <td><Badge tone={e.isOnline ? 'ok' : 'bad'}>{e.isOnline ? 'Online' : 'Offline'}</Badge></td>
                  <td>{e.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-gap">IP history</h2>
      {d.ips.length === 0 ? <Empty>No IP history recorded.</Empty> : (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>IP</th><th>First seen</th><th>Last seen</th><th>Source</th></tr></thead>
            <tbody>
              {d.ips.map((h) => (
                <tr key={h.id}>
                  <td className="mono">{h.port == null ? h.ip : `${h.ip}:${h.port}`}</td>
                  <td className="num">{fmtDateTime(h.firstSeen)}</td>
                  <td className="num">{h.lastSeen ? fmtDateTime(h.lastSeen) : <Badge tone="ok">Current</Badge>}</td>
                  <td>{h.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
