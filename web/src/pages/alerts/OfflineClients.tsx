import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertsApi, type OfflineClient } from './api';
import { PageHeader } from '../../components/ui';
import { ConfirmDialog, useToast, useDebounced } from '../../components/kit';
import { useCan } from '../../auth';
import { QueryState } from './AlertsCommon';
import { absTime, relTime, ipSortKey } from './format';
import './alerts.css';

type SortKey = 'name' | 'ip' | 'last';
const isWifi = (t: string | null) => !!t && t.trim().toLowerCase() === 'wifi';
const apOnly = (d: string | null) => (d ? d.split('•')[0].trim() || d : '—');

export default function OfflineClients() {
  const { id } = useParams();
  const subnetId = id ? Number(id) : undefined;
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [hideIgnored, setHideIgnored] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [del, setDel] = useState<OfflineClient | null>(null);
  const { edit } = useCan();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['alerts', 'offline-clients', subnetId ?? 'all'],
    queryFn: () => alertsApi.offlineClients(subnetId),
    refetchInterval: (query) => {
      const s = query.state.data?.autoRefreshSeconds ?? 0;
      return s > 0 ? Math.min(3600, Math.max(5, s)) * 1000 : false;
    },
  });
  const remove = useMutation({
    mutationFn: (c: OfflineClient) => alertsApi.deleteClient(c.id),
    onSuccess: (_r, c) => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['summary'] }); qc.invalidateQueries({ queryKey: ['devices'] }); toast(`Deleted '${c.name}'`); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const rows = useMemo(() => {
    let l = data?.items ?? [];
    if (hideIgnored) l = l.filter((d) => !d.ignoreOffline);
    const s = dq.trim().toLowerCase();
    if (s) {
      l = l.filter((d) => [d.name, d.type, d.hostname, d.ipAddress, d.macAddress, d.subnet, d.location, d.connectionType, d.connectionDetail]
        .some((v) => v && v.toLowerCase().includes(s)));
    }
    const k = sort.key;
    return [...l].sort((a, b) => {
      const av = k === 'name' ? a.name.toLowerCase() : k === 'ip' ? ipSortKey(a.ipAddress) : a.lastOnlineAt ? Date.parse(a.lastOnlineAt) : 0;
      const bv = k === 'name' ? b.name.toLowerCase() : k === 'ip' ? ipSortKey(b.ipAddress) : b.lastOnlineAt ? Date.parse(b.lastOnlineAt) : 0;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [data, hideIgnored, dq, sort]);

  const th = (key: SortKey, label: string) => (
    <th className="sortable" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="btn link-btn" style={{ color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  const title = data?.subnetName ? `Offline clients — ${data.subnetName}` : 'Offline clients';
  const tips = data?.showLastSeenTooltips ?? true;

  return (
    <>
      <PageHeader
        title={title}
        sub={data ? `${rows.length} shown of ${data.items.length}` : undefined}
        actions={<button className="btn ghost" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>}
      />
      <div className="toolbar">
        <input className="search" type="search" aria-label="Search offline clients" placeholder="Search name, type, hostname, IP, MAC, connection…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="alerts-check">
          <input type="checkbox" checked={hideIgnored} onChange={(e) => setHideIgnored(e.target.checked)} />
          Hide ignored offline devices
        </label>
        {subnetId && <Link className="btn ghost" to="/clients/offline">All subnets</Link>}
      </div>

      <QueryState isLoading={isLoading} error={error} empty={rows.length === 0} emptyText="No offline entries found.">
        <div className="card flush">
          <table className="table">
            <thead>
              <tr>
                <th /> {th('name', 'Name')}<th className="alerts-hide-sm">Type</th><th className="alerts-hide-sm">Hostname</th>
                {th('ip', 'IP')}<th>Subnet</th><th className="alerts-hide-sm">Location</th><th className="alerts-hide-sm">MAC</th>
                <th>Conn</th><th className="alerts-hide-sm">Where</th>{th('last', 'Last online')}<th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const wifi = isWifi(d.connectionType);
                const conn = [d.connectionType, d.connectionDetail].filter(Boolean).join(' • ');
                return (
                  <tr key={d.id}>
                    <td className="w1"><span className="dot down" role="img" aria-label="Offline" title={tips ? `Last online: ${absTime(d.lastOnlineAt)} (${relTime(d.lastOnlineAt)})` : 'Offline'} /></td>
                    <td className="strong">{d.name}{d.ignoreOffline && <span className="pill warn">ignored</span>}</td>
                    <td className="alerts-hide-sm">{d.type || '—'}</td>
                    <td className="alerts-hide-sm">{d.hostname || '—'}</td>
                    <td className="mono">{d.ipAddress || '—'}</td>
                    <td>{d.subnetId ? <a href={`/subnets/${d.subnetId}/ips`}>{d.subnet}</a> : '—'}</td>
                    <td className="alerts-hide-sm">{d.location || '—'}</td>
                    <td className="mono muted alerts-hide-sm">{d.macAddress || '—'}</td>
                    <td>{d.connectionType ? <span title={conn} className={wifi ? 'alerts-wifi' : 'muted'}>{wifi ? 'WiFi' : d.connectionType}</span> : ''}</td>
                    <td className="alerts-hide-sm"><span className="alerts-trunc" style={{ display: 'inline-block' }} title={d.connectionDetail ?? undefined}>{wifi ? apOnly(d.connectionDetail) : d.connectionDetail || '—'}</span></td>
                    <td className="alerts-time">{absTime(d.lastOnlineAt)}<span className="muted small">{relTime(d.lastOnlineAt)}</span></td>
                    <td>
                      <div className="alerts-actions">
                        <a className="btn sm" href={d.isDevice ? '/devices' : '/clients'} title="Opens the classic list, where you can edit this entry">Edit</a>
                        {edit && <button className="btn danger sm" disabled={remove.isPending} onClick={() => setDel(d)} aria-label={`Delete ${d.name}`}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </QueryState>

      {del && (
        <ConfirmDialog title="Delete entry?" message={`Are you sure you want to delete '${del.name}'?`} confirmLabel="Delete"
          onClose={() => setDel(null)}
          onConfirm={async () => { await remove.mutateAsync(del); setDel(null); }} />
      )}
    </>
  );
}
