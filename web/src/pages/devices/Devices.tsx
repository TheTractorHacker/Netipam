import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { devicesApi, type DeviceRow } from './api';
import { PageHeader, Empty } from '../../components/ui';

type Status = 'all' | 'online' | 'offline';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function StatusDot({ d }: { d: DeviceRow }) {
  if (!d.isStatusTracked) return <span className="dot off" title="Not tracked" />;
  return <span className={'dot ' + (d.isOnline ? 'on' : 'down')} title={d.isOnline ? 'Online' : 'Offline'} />;
}

export default function Devices({ kind, title }: { kind: 'device' | 'client'; title: string }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const dq = useDebounced(q);
  const { data, isLoading, error } = useQuery({ queryKey: ['devices', kind, dq], queryFn: () => devicesApi.list(kind, dq) });

  const rows = (data ?? []).filter((d) => status === 'all' || (status === 'online' ? d.isOnline : !d.isOnline));

  return (
    <>
      <PageHeader
        title={title}
        sub={data ? `${rows.length} shown` : undefined}
        actions={<a className="btn ghost" href={`/export/${kind === 'device' ? 'devices' : 'clients'}.xlsx`}>Export .xlsx</a>}
      />
      <div className="toolbar">
        <input className="search" placeholder="Search name, IP, MAC, hostname…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label="Status filter">
          {(['all', 'online', 'offline'] as Status[]).map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
      </div>

      {isLoading && <div className="muted">Loading…</div>}
      {error && <div className="error">{(error as Error).message}</div>}
      {data && rows.length === 0 && <Empty>Nothing matches. Try clearing the filters.</Empty>}
      {rows.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr><th></th><th>Name</th><th>IP address</th><th>MAC</th><th>Type</th><th>Vendor / model</th><th>Subnet</th><th>Location</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="w1"><StatusDot d={d} /></td>
                  <td>
                    <div className="strong">{d.name}{d.isCritical && <span className="pill warn">critical</span>}</div>
                    {d.hostname && d.hostname !== d.name && <div className="muted small">{d.hostname}</div>}
                  </td>
                  <td className="mono">{d.ipAddress ?? '—'}</td>
                  <td className="mono muted">{d.macAddress ?? '—'}</td>
                  <td>{d.type ?? '—'}</td>
                  <td>{[d.manufacturer, d.model].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{d.subnet ?? '—'}</td>
                  <td>{d.location ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
