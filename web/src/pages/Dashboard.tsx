import { useQuery } from '@tanstack/react-query';
import { api, type SubnetRow } from '../api';
import { PageHeader, Stat, Empty } from '../components/ui';

function Usage({ s }: { s: SubnetRow }) {
  const pct = s.usable > 0 ? Math.min(100, Math.round((s.used / s.usable) * 100)) : 0;
  const tone = pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : 'ok';
  return (
    <div className="usage" title={`${s.used} of ${s.usable} addresses used`}>
      <div className="bar"><div className={`fill ${tone}`} style={{ width: `${pct}%` }} /></div>
      <span className="num">{pct}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 30_000 });

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub="Live overview of your network"
        actions={<button className="btn ghost" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>}
      />
      {isLoading && <div className="muted">Loading…</div>}
      {error && <div className="error">Couldn't load the summary: {(error as Error).message}</div>}
      {data && (
        <>
          {data.clients + data.devices === 0 && (
            <div className="card callout">
              <strong>Nothing here yet.</strong> Connect UniFi in Settings, add your subnets, then run an import.
              <div className="row">
                <a className="btn primary" href="/settings">Open settings</a>
                <a className="btn" href="/subnets">Subnets</a>
                <a className="btn" href="/unifi-import">Import</a>
              </div>
            </div>
          )}

          <div className="stats">
            <Stat label="Devices" value={data.devices} />
            <Stat label="Clients" value={data.clients} />
            <Stat label="Offline" value={data.offline} tone={data.offline > 0 ? 'bad' : undefined} />
            <Stat label="Offline alerts" value={data.offlineAlerts} tone={data.offlineAlerts > 0 ? 'warn' : undefined} href="/alerts/offline" />
            <Stat label="New devices" value={data.newDevices} tone={data.newDevices > 0 ? 'info' : undefined} href="/alerts/discovery" />
            <Stat label="Firmware updates" value={data.firmwareUpdates} tone={data.firmwareUpdates > 0 ? 'info' : undefined} />
          </div>

          <section className="card">
            <h2>Subnets</h2>
            {data.subnets.length === 0 ? (
              <Empty>No subnets yet. <a href="/subnets">Add one</a> and it will show up here.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Subnet</th><th>CIDR</th><th>VLAN</th><th className="r">Used</th><th className="r">Available</th>
                    <th>Usage</th><th className="r">Clients</th><th className="r">Devices</th><th className="r">Offline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subnets.map((s) => (
                    <tr key={s.id}>
                      <td><a href={`/subnets/${s.id}/ips`}>{s.name}</a></td>
                      <td className="mono">{s.cidr}</td>
                      <td>{s.vlanId ?? '—'}</td>
                      <td className="r num">{s.used}</td>
                      <td className="r num">{s.available}</td>
                      <td><Usage s={s} /></td>
                      <td className="r num">{s.clients}</td>
                      <td className="r num">{s.devices}</td>
                      <td className={'r num' + (s.offline > 0 ? ' bad-text' : '')}>{s.offline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
