import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ErrorNote, Field, Spinner, TextInput, useDebounced } from '../../components/kit';
import { contains, dayRange, fmtDateTime, historyApi, type ChangeRow, type RunRow } from './api';
import './history.css';

function fmtRetention(h: number) {
  return h % 24 === 0 ? (h === 24 ? '24 hours' : `${h / 24} days`) : `${h} hours`;
}
function fmtDuration(ms: number | null) {
  if (ms == null) return '-';
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
const changeMatches = (c: ChangeRow, t: string) =>
  contains(c.deviceName, t) || contains(c.ip, t) || contains(c.field, t) || contains(c.oldValue, t) || contains(c.newValue, t);

function rowClass(c: ChangeRow) {
  if (c.field.toLowerCase() !== 'onlinestatus') return undefined;
  const v = (c.newValue ?? '').toLowerCase();
  return v === 'online' ? 'history-row-on' : v === 'offline' ? 'history-row-off' : undefined;
}

function Run({ run, changes, defaultOpen }: { run: RunRow; changes: ChangeRow[]; defaultOpen: boolean }) {
  return (
    <details className="history-run" open={defaultOpen || undefined}>
      <summary>
        <span className="strong num">{fmtDateTime(run.startedAt)}</span>
        <Badge tone={run.changedCount > 0 ? 'info' : 'neutral'}>{run.changedCount} {run.changedCount === 1 ? 'change' : 'changes'}</Badge>
        {run.error && <Badge tone="bad">Error</Badge>}
        <span className="history-spacer" />
        <span className="muted small">{fmtDuration(run.durationMs)}{run.source ? ` · ${run.source}` : ''}</span>
      </summary>
      <div className="history-run-body">
        {run.error && <div className="error" role="alert">{run.error}</div>}
        <div className="muted small">Started {fmtDateTime(run.startedAt)} · Duration {fmtDuration(run.durationMs)}</div>
        {changes.length === 0 ? <p className="muted" style={{ margin: 0 }}>No changes recorded.</p> : (
          <div className="history-scroll">
            <table className="table">
              <thead><tr><th>Device</th><th>IP</th><th>Field</th><th>Old</th><th>New</th></tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className={rowClass(c)}>
                    <td>{c.deviceName}</td>
                    <td className="mono">{c.ip}</td>
                    <td>{c.field}</td>
                    <td>{c.oldValue}</td>
                    <td>{c.newValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

export default function Logs() {
  const q = useQuery({ queryKey: ['updater-logs'], queryFn: historyApi.logs });
  const [search, setSearch] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [changesOnly, setChangesOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const term = useDebounced(search.trim().toLowerCase(), 200);

  const filtered = useMemo(() => {
    const range = dayRange(from, to);
    return (q.data?.runs ?? []).flatMap((r) => {
      if (errorsOnly && !r.error?.trim()) return [];
      if (changesOnly && r.changes.length === 0) return [];
      if (range) {
        const t = new Date(r.startedAt).getTime();
        if (t < range[0] || t >= range[1]) return [];
      }
      const changes = term ? r.changes.filter((c) => changeMatches(c, term)) : r.changes;
      if (term && !contains(r.error, term) && changes.length === 0) return [];
      return [{ run: r, changes }];
    });
  }, [q.data, term, errorsOnly, changesOnly, from, to]);

  const retention = q.data ? fmtRetention(q.data.retentionHours) : '';

  return (
    <>
      <PageHeader
        title="Updater logs"
        sub={q.data ? `Runs from the last ${retention} (change in Settings)` : undefined}
        actions={
          <>
            <button className="btn" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Refreshing…' : 'Refresh'}</button>
            <a className="btn" href="/export/updater-logs.xlsx" download>Export .xlsx</a>
          </>
        }
      />
      <div className="history-filters">
        <div className="search field">
          <span className="field-label">Search</span>
          <TextInput type="search" placeholder="Device, IP, field, old/new, error…" aria-label="Search logs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Field label="From"><TextInput type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
        <label className="history-check"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Errors only</label>
        <label className="history-check"><input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} /> With changes</label>
        {(from || to) && <button className="btn ghost sm" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
      </div>

      {q.isLoading && <Spinner />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data && filtered.length === 0 && (
        <Empty>{q.data.runs.length === 0 ? `No updater runs in the last ${retention}.` : 'No runs match the current filters.'}</Empty>
      )}
      {filtered.map(({ run, changes }) => <Run key={run.id} run={run} changes={changes} defaultOpen={false} />)}
    </>
  );
}
