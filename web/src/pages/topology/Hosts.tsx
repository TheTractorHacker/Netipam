import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { topologyApi } from './api';
import { PageHeader, Empty } from '../../components/ui';
import { Spinner, ErrorNote, Switch, Badge } from '../../components/kit';
import { StatusBadge, StatusDot, NameLink, statusOf } from './shared';
import './topology.css';

export default function Hosts() {
  const [hideEmpty, setHideEmpty] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['hosts'], queryFn: topologyApi.hosts });
  const hosts = (data?.hosts ?? []).filter((h) => !hideEmpty || h.guests.length > 0);

  return (
    <>
      <PageHeader
        title="Hosts & guests"
        sub={data ? `${hosts.length} host${hosts.length === 1 ? '' : 's'}` : undefined}
        actions={<Switch checked={hideEmpty} onChange={setHideEmpty} label="Hide hosts without guests" />}
      />
      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && hosts.length === 0 && <Empty>No hosts found.</Empty>}
      <div className="hosts-list">
        {hosts.map(({ host, guests }) => (
          <details key={host.id} className="card flush hosts-card">
            <summary>
              <div className="hosts-grow">
                <div className="hosts-title"><NameLink name={host.name} href={host.accessHref} /></div>
                <div className="hosts-sub">
                  {[host.hostname, host.type, host.ipAddress !== '-' ? host.ipAddress : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              {host.isProxmox && <Badge tone="info">Proxmox</Badge>}
              <Badge>{guests.length} guest{guests.length === 1 ? '' : 's'}</Badge>
              <StatusBadge d={host} />
            </summary>
            {guests.length === 0 ? (
              <div className="hosts-none">No guests on this host.</div>
            ) : (
              <table className="table hosts-table">
                <thead><tr><th className="w1"><span className="sr-only">Status</span></th><th>Name</th><th className="hide-sm">Hostname</th><th>Type</th><th>IP</th></tr></thead>
                <tbody>
                  {guests.map((g) => (
                    <tr key={g.id}>
                      <td className="w1"><StatusDot d={g} /><span className="sr-only">{statusOf(g)}</span></td>
                      <td className="strong"><NameLink name={g.name} href={g.accessHref} /></td>
                      <td className="hide-sm">{g.hostname ?? '—'}</td>
                      <td>{g.type ?? '—'}</td>
                      <td className="mono">{g.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </details>
        ))}
      </div>
    </>
  );
}
