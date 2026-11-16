import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ErrorNote, Field, Select, Spinner, TextInput, useDebounced } from '../../components/kit';
import { contains, dayRange, fmtDateTime, historyApi, toInputDate, type IpRow } from './api';
import './history.css';

const PAGE = 200;

export default function IpHistory() {
  const q = useQuery({ queryKey: ['ip-history'], queryFn: historyApi.ip });
  const today = new Date();
  const [from, setFrom] = useState(toInputDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)));
  const [to, setTo] = useState(toInputDate(today));
  const [subnet, setSubnet] = useState('');
  const [search, setSearch] = useState('');
  const [asc, setAsc] = useState<boolean | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const term = useDebounced(search.trim().toLowerCase(), 200);

  const rows = useMemo(() => {
    const range = dayRange(from, to);
    const now = Date.now();
    const list = (q.data?.rows ?? []).filter((h: IpRow) => {
      if (range) {
        const end = h.lastSeen ? new Date(h.lastSeen).getTime() : now;
        if (!(new Date(h.firstSeen).getTime() < range[1] && end >= range[0])) return false;
      }
      if (subnet && String(h.subnetId) !== subnet) return false;
      if (term && !(contains(h.ip, term) || contains(h.source, term) || contains(h.deviceName, term) ||
        contains(h.hostname, term) || contains(h.mac, term) || contains(h.type, term))) return false;
      return true;
    });
    if (asc !== null) list.sort((a, b) => (a.sortKey - b.sortKey) * (asc ? 1 : -1));
    return list;
  }, [q.data, from, to, subnet, term, asc]);

  return (
    <>
      <PageHeader
        title="IP history"
        sub={q.data ? `${rows.length.toLocaleString()} of ${q.data.rows.length.toLocaleString()} records` : undefined}
        actions={
          <>
            <button className="btn" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Refreshing…' : 'Refresh'}</button>
            <a className="btn" href="/export/ip-history.xlsx" download>Export .xlsx</a>
          </>
        }
      />
      <div className="history-filters">
        <div className="search field">
          <span className="field-label">Search</span>
          <TextInput type="search" placeholder="IP, device, MAC, hostname, source…" aria-label="Search IP history" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }} />
        </div>
        <Field label="From"><TextInput type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Subnet">
          <Select value={subnet} onChange={(e) => { setSubnet(e.target.value); setLimit(PAGE); }}>
            <option value="">All subnets</option>
            {q.data?.subnets.map((s) => <option key={s.id} value={s.id}>{s.cidr ? `${s.name} (${s.cidr})` : s.name}</option>)}
          </Select>
        </Field>
        {(from || to) && <button className="btn ghost sm" onClick={() => { setFrom(''); setTo(''); }}>All time</button>}
      </div>

      {q.isLoading && <Spinner />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data && rows.length === 0 && <Empty>No IP history in the selected range.</Empty>}
      {rows.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr>
                <th className="sortable" aria-sort={asc === null ? 'none' : asc ? 'ascending' : 'descending'}>
                  <button className="btn link-btn" style={{ font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', color: 'inherit' }}
                    onClick={() => setAsc(asc === null ? true : asc ? false : null)}>
                    IP {asc === null ? '' : asc ? '▲' : '▼'}
                  </button>
                </th>
                <th>Device</th><th>MAC</th><th>Type</th><th>First seen</th><th>Last seen</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((h) => (
                <tr key={h.id}>
                  <td className="mono">{h.port == null ? h.ip : `${h.ip}:${h.port}`}</td>
                  <td><Link to={`/devices/${h.deviceId}/history`}>{h.deviceName ?? `#${h.deviceId}`}</Link></td>
                  <td className="mono">{h.mac ?? '—'}</td>
                  <td>{h.type ?? '—'}</td>
                  <td className="num">{fmtDateTime(h.firstSeen)}</td>
                  <td className="num">{h.lastSeen ? fmtDateTime(h.lastSeen) : <Badge tone="ok">Current</Badge>}</td>
                  <td>{h.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button className="btn" onClick={() => setLimit(limit + PAGE)}>Show more ({(rows.length - limit).toLocaleString()} remaining)</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
