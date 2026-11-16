import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { taxonomyApi, type LocationDevice } from './api';
import { PageHeader, Empty } from '../../components/ui';
import { ErrorNote, Spinner, useDebounced } from '../../components/kit';
import './taxonomy.css';

const has = (v: string | null | undefined, s: string) => !!v && v.toLowerCase().includes(s);

function StatusDot({ d }: { d: LocationDevice }) {
  if (!d.isStatusTracked) return <span className="dot" title="Not tracked" />;
  return <span className={'dot ' + (d.isOnline ? 'on' : 'down')} title={d.isOnline ? 'Online' : 'Offline'} />;
}

export default function LocationDevicesPage() {
  const id = Number(useParams().id);
  const [q, setQ] = useState('');
  const dq = useDebounced(q).trim().toLowerCase();
  const { data, isLoading, error } = useQuery({
    queryKey: ['location-devices', id],
    queryFn: () => taxonomyApi.locationDevices(id),
    enabled: Number.isFinite(id),
  });

  const rows = useMemo(() => {
    const all = data?.devices ?? [];
    if (!dq) return all;
    return all.filter((d) => has(d.name, dq) || has(d.type, dq) || has(d.hostname, dq) || has(d.ipAddress, dq) || has(d.macAddress, dq) || has(d.subnet, dq));
  }, [data, dq]);

  return (
    <>
      <Link className="tax-back" to="/locations">← Back to locations</Link>
      <PageHeader
        title={data ? `Location: ${data.location.name}` : 'Location devices'}
        sub={data ? (data.location.description || `${rows.length} of ${data.devices.length} devices`) : undefined}
      />
      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <div className="toolbar">
            <input className="search" type="search" aria-label="Search devices" placeholder="Search name, type, hostname, IP, subnet, MAC…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {rows.length === 0 ? (
            <Empty>{data.devices.length === 0 ? 'No devices assigned to this location.' : 'Nothing matches your search.'}</Empty>
          ) : (
            <div className="card flush">
              <table className="table">
                <thead>
                  <tr><th style={{ width: 28 }}><span className="tax-sr">Status</span></th><th>Name</th><th>Type</th><th className="tax-hide-sm">Hostname</th><th>IP</th><th>Subnet</th><th className="tax-hide-sm">MAC</th></tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td><StatusDot d={d} /></td>
                      <td className="strong">
                        {d.accessHref
                          ? <a href={d.accessHref} target="_blank" rel="noopener noreferrer">{d.name}</a>
                          : d.name}
                      </td>
                      <td>{d.type ?? <span className="muted">—</span>}</td>
                      <td className="tax-hide-sm">{d.hostname ?? <span className="muted">—</span>}</td>
                      <td className="num tax-mono">{d.ipAddress ?? <span className="muted">—</span>}</td>
                      <td>{d.subnetId != null ? <Link to={`/subnets/${d.subnetId}/ips`}>{d.subnet}</Link> : <span className="muted">—</span>}</td>
                      <td className="tax-hide-sm tax-mono">{d.macAddress ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
