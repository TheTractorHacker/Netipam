import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { searchApi } from './api';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ErrorNote, Spinner } from '../../components/kit';
import { SmartLink, useGo } from './nav';

function Group({ title, count, truncated, children }: { title: string; count: number; truncated?: boolean; children: ReactNode }) {
  return (
    <section className="section-gap" style={{ marginTop: 0 }}>
      <h2 className="search-group-title">{title} <span className="tab-count">{count}{truncated ? '+' : ''}</span></h2>
      <div className="card flush">{children}</div>
    </section>
  );
}

function Row({ to, children }: { to: string; children: ReactNode }) {
  const go = useGo();
  return <tr tabIndex={-1} onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) go(to); }}>{children}</tr>;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchApi.search(q),
    enabled: q.length > 0,
  });

  const submit = () => setParams(input.trim() ? { q: input.trim() } : {}, { replace: false });
  const onKey = (e: KeyboardEvent) => e.key === 'Enter' && submit();

  const total = data ? data.devices.length + data.subnets.length + data.ips.length + data.locations.length + data.racks.length : 0;

  return (
    <>
      <PageHeader title="Search" sub="IP, name, MAC, hostname, location, model, notes…" />
      <div className="toolbar">
        <input
          className="search search-input" type="search" autoFocus
          aria-label="Search" placeholder="IP, name, MAC, hostname, location, model, notes…"
          value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
        />
        <button className="btn primary" onClick={submit}>Search</button>
      </div>

      {!q && <Empty>Type something above and press Enter. <span className="small">Tip: press <kbd>Ctrl K</kbd> anywhere for quick jump.</span></Empty>}
      {q && error && <ErrorNote error={error} />}
      {q && !data && !error && <Spinner label="Searching…" />}
      {q && data && total === 0 && <Empty>No results for “{q}”.</Empty>}

      {q && data && total > 0 && (
        <div className="search-groups" aria-busy={isFetching}>
          {data.devices.length > 0 && (
            <Group title="Devices & clients" count={data.devices.length} truncated={data.devicesTruncated}>
              <table className="table clickable">
                <thead><tr><th>Name</th><th>IP</th><th>MAC</th><th>Type</th><th>Location</th><th>Subnet</th><th>Status</th></tr></thead>
                <tbody>
                  {data.devices.map((d) => {
                    const to = d.isDevice ? '/devices' : '/clients';
                    return (
                      <Row key={d.id} to={to}>
                        <td>
                          <SmartLink to={to} className="strong">{d.name}</SmartLink>
                          {d.detail && <div className="muted small">{d.detail}</div>}
                        </td>
                        <td className="mono">{d.ip ?? ''}</td>
                        <td className="mono">{d.mac ?? ''}</td>
                        <td>{d.type ?? ''}</td>
                        <td>{d.location ?? ''}</td>
                        <td>{d.subnet ?? ''}</td>
                        <td><Badge tone={d.online ? 'ok' : 'neutral'}>{d.online ? 'Online' : 'Offline'}</Badge></td>
                      </Row>
                    );
                  })}
                </tbody>
              </table>
            </Group>
          )}

          {data.subnets.length > 0 && (
            <Group title="Subnets" count={data.subnets.length}>
              <table className="table clickable">
                <thead><tr><th>Name</th><th>CIDR</th><th>VLAN</th><th>Description</th></tr></thead>
                <tbody>
                  {data.subnets.map((s) => (
                    <Row key={s.id} to={`/subnets/${s.id}/ips`}>
                      <td><SmartLink to={`/subnets/${s.id}/ips`} className="strong">{s.name}</SmartLink></td>
                      <td className="mono">{s.cidr}</td>
                      <td>{s.vlanId ?? ''}</td>
                      <td className="muted">{s.description ?? ''}</td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </Group>
          )}

          {data.ips.length > 0 && (
            <Group title="IP reservations" count={data.ips.length}>
              <table className="table clickable">
                <thead><tr><th>IP</th><th>Status</th><th>Device</th><th>Subnet</th><th>Notes</th></tr></thead>
                <tbody>
                  {data.ips.map((i) => (
                    <Row key={i.id} to={`/subnets/${i.subnetId}/ips`}>
                      <td><SmartLink to={`/subnets/${i.subnetId}/ips`} className="mono strong">{i.ip}</SmartLink></td>
                      <td><Badge tone={i.status === 'Reserved' ? 'info' : 'neutral'}>{i.status}</Badge></td>
                      <td>{i.device ?? ''}</td>
                      <td>{i.subnetName ?? ''}</td>
                      <td className="muted">{i.notes ?? ''}</td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </Group>
          )}

          {data.locations.length > 0 && (
            <Group title="Locations" count={data.locations.length}>
              <table className="table clickable">
                <thead><tr><th>Name</th></tr></thead>
                <tbody>
                  {data.locations.map((l) => (
                    <Row key={l.id} to={`/locations/${l.id}/devices`}>
                      <td><SmartLink to={`/locations/${l.id}/devices`} className="strong">{l.name}</SmartLink></td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </Group>
          )}

          {data.racks.length > 0 && (
            <Group title="Racks" count={data.racks.length}>
              <table className="table clickable">
                <thead><tr><th>Name</th><th>Location</th><th>Units</th><th>Description</th></tr></thead>
                <tbody>
                  {data.racks.map((r) => (
                    <Row key={r.id} to="/racks">
                      <td><SmartLink to="/racks" className="strong">{r.name}</SmartLink></td>
                      <td>{r.location ?? ''}</td>
                      <td>{r.rackUnits ?? ''}</td>
                      <td className="muted">{r.description ?? ''}</td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </Group>
          )}
        </div>
      )}
    </>
  );
}
