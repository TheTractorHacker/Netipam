import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCan } from '../../auth';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, Spinner, Tabs, TextInput, useToast } from '../../components/kit';
import {
  importApi, type ClientRow, type Commit, type InfraRow, type Kind, type Preview, type SubnetRow, type UpdateRow,
} from './api';
import './import.css';

/* ---------- small shared bits ---------- */
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

function KindBadge({ kind }: { kind: Kind }) {
  return <Badge tone={kind === 'new' ? 'ok' : kind === 'changed' ? 'warn' : 'neutral'}>{kind === 'new' ? 'New' : kind === 'changed' ? 'Changed' : 'Unchanged'}</Badge>;
}
function OnlineBadge({ on }: { on: boolean }) {
  return <Badge tone={on ? 'ok' : 'bad'}>{on ? 'Online' : 'Offline'}</Badge>;
}

function Check({ checked, indeterminate, onChange, label, disabled }: {
  checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <input
      type="checkbox" aria-label={label} checked={checked} disabled={disabled}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function useAfterCommit() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['summary', 'dashboard', 'devices', 'subnets', 'topology', 'client-types', 'racks', 'alerts', 'search']) qc.invalidateQueries({ queryKey: [k] });
  };
}

function useNotifyDelay() {
  const toast = useToast();
  return (p: { waitedSeconds: number }) => {
    if (p.waitedSeconds > 0) toast(`UniFi calls are staggered: waited ${p.waitedSeconds}s before contacting the controller.`, 'info');
  };
}

type Note = { tone: 'ok' | 'bad'; text: string } | null;

/* ---------- generic preview/commit panel ---------- */
interface Col<T> { head: string; cell: (r: T) => ReactNode; cls?: string }

function SelectPanel<T extends { selected: boolean; kind: Kind }>({
  title, hint, loadLabel, noun, load, commit, columns, searchText, rowKey,
}: {
  title: string; hint: string; loadLabel: string; noun: string;
  load: () => Promise<Preview<T>>;
  commit: (rows: T[]) => Promise<Commit>;
  columns: Col<T>[];
  searchText: (r: T) => string;
  rowKey: (r: T) => string;
}) {
  const toast = useToast();
  const afterCommit = useAfterCommit();
  const notifyDelay = useNotifyDelay();
  const [rows, setRows] = useState<T[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [q, setQ] = useState('');

  const loadM = useMutation({
    mutationFn: load,
    onMutate: () => setNote(null),
    onSuccess: (p) => { setRows(p.rows); setFilter('all'); setNote({ tone: 'ok', text: p.message }); notifyDelay(p); afterCommit(); },
    onError: (e: Error) => { setRows(null); setNote({ tone: 'bad', text: e.message }); },
  });
  const commitM = useMutation({
    mutationFn: (sel: T[]) => commit(sel),
    onMutate: () => setNote(null),
    onSuccess: (r) => { setNote({ tone: 'ok', text: r.message + ' Reload the preview to see the new state.' }); toast(r.message); afterCommit(); },
    onError: (e: Error) => { setNote({ tone: 'bad', text: e.message }); toast(e.message, 'bad'); },
  });
  const busy = loadM.isPending || commitM.isPending;

  const all = rows ?? [];
  const selectedCount = all.filter((r) => r.selected).length;
  const counts = { new: all.filter((r) => r.kind === 'new').length, changed: all.filter((r) => r.kind === 'changed').length, unchanged: all.filter((r) => r.kind === 'unchanged').length };
  const needle = q.trim().toLowerCase();
  const visible = all.filter((r) => (filter === 'all' || r.kind === filter) && (!needle || searchText(r).toLowerCase().includes(needle)));
  const allVisibleSelected = visible.length > 0 && visible.every((r) => r.selected);
  const someVisibleSelected = visible.some((r) => r.selected);

  const setSel = (pred: (r: T) => boolean, v: boolean) => setRows((cur) => cur && cur.map((r) => (pred(r) ? { ...r, selected: v } : r)));
  const visibleSet = new Set(visible.map(rowKey));

  return (
    <section className="card">
      <div className="import-panel-head">
        <div>
          <h2>{title}</h2>
          <p className="muted hint">{hint}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => loadM.mutate()} disabled={busy}>{loadM.isPending ? 'Loading…' : rows ? 'Reload preview' : loadLabel}</button>
          <button className="btn primary" onClick={() => commitM.mutate(all.filter((r) => r.selected))} disabled={busy || selectedCount === 0}>
            {commitM.isPending ? 'Importing…' : `Commit (${selectedCount})`}
          </button>
        </div>
      </div>

      {note && <div className={`import-note ${note.tone}`} role={note.tone === 'bad' ? 'alert' : 'status'}>{note.text}</div>}
      {loadM.isPending && <Spinner label="Contacting UniFi controller… this can take a few seconds." />}

      {rows && rows.length === 0 && !loadM.isPending && <Empty>The controller returned no {noun}.</Empty>}

      {rows && rows.length > 0 && (
        <>
          <div className="import-toolbar">
            <Tabs
              value={filter} onChange={setFilter}
              tabs={[
                { id: 'all', label: 'All', count: all.length },
                { id: 'new', label: 'New', count: counts.new },
                { id: 'changed', label: 'Changed', count: counts.changed },
                { id: 'unchanged', label: 'Unchanged', count: counts.unchanged },
              ]}
            />
          </div>
          <div className="import-toolbar">
            <TextInput className="search" type="search" placeholder={`Filter ${noun}…`} aria-label={`Filter ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm ghost" onClick={() => setSel((r) => r.kind !== 'unchanged', true)} disabled={busy}>Select new &amp; changed</button>
            <button className="btn sm ghost" onClick={() => setSel(() => true, false)} disabled={busy || selectedCount === 0}>Select none</button>
            <span className="muted small push">{visible.length} shown · {selectedCount} selected</span>
          </div>
          <div className="card flush">
            <table className="table import-table">
              <thead>
                <tr>
                  <th className="w1">
                    <Check label="Select all shown" checked={allVisibleSelected} indeterminate={someVisibleSelected}
                      onChange={(v) => setSel((r) => visibleSet.has(rowKey(r)), v)} />
                  </th>
                  <th>Status</th>
                  {columns.map((c) => <th key={c.head} className={c.cls}>{c.head}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={columns.length + 2} className="muted">Nothing matches the filter.</td></tr>}
                {visible.map((r) => (
                  <tr key={rowKey(r)} className={r.kind === 'unchanged' ? 'is-unchanged' : ''}>
                    <td><Check label={`Select ${rowKey(r)}`} checked={r.selected} onChange={(v) => setSel((x) => rowKey(x) === rowKey(r), v)} /></td>
                    <td><KindBadge kind={r.kind} /></td>
                    {columns.map((c) => <td key={c.head} className={c.cls}>{c.cell(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!rows && !loadM.isPending && !note && <Empty>Nothing loaded yet. Use “{loadLabel}” to fetch from the controller.</Empty>}
    </section>
  );
}

/* ---------- tabs ---------- */
function dhcp(s: SubnetRow) {
  const a = s.dhcpStart?.trim(), b = s.dhcpEnd?.trim();
  return a && b ? `${a} – ${b}` : a || b || '—';
}

function SubnetsPanel() {
  return (
    <SelectPanel<SubnetRow>
      title="Subnets" noun="subnets" loadLabel="Load subnets preview"
      hint="Networks defined on the controller, matched to your subnets by CIDR."
      load={importApi.subnetsPreview} commit={importApi.subnetsCommit}
      rowKey={(r) => r.cidr}
      searchText={(r) => [r.name, r.cidr, r.description].join(' ')}
      columns={[
        { head: 'Name', cell: (r) => <span className="strong">{dash(r.name)}</span> },
        { head: 'CIDR', cell: (r) => <span className="mono">{r.cidr}</span> },
        { head: 'Description', cls: 'cell-wrap', cell: (r) => dash(r.description) },
        { head: 'DHCP range', cell: (r) => <span className="mono">{dhcp(r)}</span> },
        { head: 'VLAN', cls: 'r num', cell: (r) => dash(r.vlanId) },
      ]}
    />
  );
}

function InfraPanel() {
  return (
    <SelectPanel<InfraRow>
      title="UniFi devices" noun="devices" loadLabel="Load devices preview"
      hint="Switches, access points and gateways. Device types are created automatically if missing."
      load={importApi.devicesPreview} commit={importApi.devicesCommit}
      rowKey={(r) => r.mac}
      searchText={(r) => [r.name, r.mac, r.ipAddress, r.model, r.unifiType, r.mappedTypeName].join(' ')}
      columns={[
        { head: 'Name', cell: (r) => <span className="strong">{dash(r.name)}</span> },
        { head: 'UniFi type', cell: (r) => <span className="mono">{dash(r.unifiType)}</span> },
        { head: 'Maps to', cell: (r) => dash(r.mappedTypeName) },
        { head: 'MAC', cell: (r) => <span className="mono">{r.mac}</span> },
        { head: 'IP', cell: (r) => <span className="mono">{dash(r.ipAddress)}</span> },
        { head: 'Model', cell: (r) => dash(r.model) },
        { head: 'Uplink', cell: (r) => dash(r.connectionDetail) },
      ]}
    />
  );
}

function ClientsPanel() {
  return (
    <SelectPanel<ClientRow>
      title="Clients" noun="clients" loadLabel="Load clients preview"
      hint="Active and known clients. New offline clients are left unselected by default."
      load={importApi.clientsPreview} commit={importApi.clientsCommit}
      rowKey={(r) => r.mac}
      searchText={(r) => [r.name, r.hostname, r.mac, r.ipAddress, r.manufacturer, r.connectionDetail].join(' ')}
      columns={[
        { head: 'Online', cell: (r) => <OnlineBadge on={r.isOnline} /> },
        { head: 'Name', cell: (r) => <span className="strong">{dash(r.name || r.hostname)}</span> },
        { head: 'Hostname', cell: (r) => dash(r.hostname) },
        { head: 'MAC', cell: (r) => <span className="mono">{r.mac}</span> },
        { head: 'IP', cell: (r) => <span className="mono">{dash(r.ipAddress)}</span> },
        { head: 'Conn', cell: (r) => (r.connectionType ? <Badge>{r.connectionType}</Badge> : '—') },
        { head: 'Where', cls: 'cell-wrap', cell: (r) => dash(r.connectionDetail) },
        { head: 'Manufacturer', cell: (r) => dash(r.manufacturer) },
      ]}
    />
  );
}

/* ---------- client update (field level) ---------- */
type URow = UpdateRow & { applyRow: boolean; expanded: boolean; applied: string[] };

function toURow(r: UpdateRow): URow {
  const changed = r.fields.filter((f) => f.changed).map((f) => f.key);
  return { ...r, applyRow: r.kind !== 'unchanged', expanded: false, applied: r.kind === 'unchanged' ? [] : changed };
}

function FieldVal({ v, changed }: { v: string | null; changed: boolean }) {
  return changed ? <span className="changed-val">{dash(v)}</span> : <>{dash(v)}</>;
}

function UpdatePanel() {
  const toast = useToast();
  const afterCommit = useAfterCommit();
  const notifyDelay = useNotifyDelay();
  const [rows, setRows] = useState<URow[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [tab, setTab] = useState<Kind>('changed');
  const [q, setQ] = useState('');

  const loadM = useMutation({
    mutationFn: importApi.updatesPreview,
    onMutate: () => setNote(null),
    onSuccess: (p) => { setRows(p.rows.map(toURow)); setNote({ tone: 'ok', text: p.message }); notifyDelay(p); },
    onError: (e: Error) => { setRows(null); setNote({ tone: 'bad', text: e.message }); },
  });
  const commitM = useMutation({
    mutationFn: (sel: URow[]) => importApi.updatesCommit(sel.map(({ applyRow: _a, expanded: _e, applied, ...r }) => ({ ...r, apply: applied }))),
    onMutate: () => setNote(null),
    onSuccess: (r) => { setNote({ tone: 'ok', text: r.message + ' Reload the preview to see the new state.' }); toast(r.message); afterCommit(); },
    onError: (e: Error) => { setNote({ tone: 'bad', text: e.message }); toast(e.message, 'bad'); },
  });
  const busy = loadM.isPending || commitM.isPending;

  const all = rows ?? [];
  const patch = (mac: string, fn: (r: URow) => URow) => setRows((cur) => cur && cur.map((r) => (r.mac === mac ? fn(r) : r)));
  const changedKeys = (r: URow) => r.fields.filter((f) => f.changed).map((f) => f.key);
  const selectedRows = all.filter((r) => r.applyRow && r.kind !== 'unchanged');
  const fieldCount = selectedRows.reduce((n, r) => n + r.applied.length, 0);
  const counts = { new: all.filter((r) => r.kind === 'new').length, changed: all.filter((r) => r.kind === 'changed').length, unchanged: all.filter((r) => r.kind === 'unchanged').length };

  const needle = q.trim().toLowerCase();
  const visible = all.filter((r) => r.kind === tab && (!needle ||
    [r.mac, ...r.fields.map((f) => f.incoming), ...r.fields.map((f) => f.current)].join(' ').toLowerCase().includes(needle)));
  const eligible = visible.filter((r) => r.kind !== 'unchanged');
  const allOn = eligible.length > 0 && eligible.every((r) => r.applyRow);
  const someOn = eligible.some((r) => r.applyRow);

  const setRowApply = (r: URow, v: boolean): URow => ({ ...r, applyRow: v, applied: v ? changedKeys(r) : [] });
  const field = (r: URow, k: string) => r.fields.find((f) => f.key === k)!;

  return (
    <section className="card">
      <div className="import-panel-head">
        <div>
          <h2>Client update</h2>
          <p className="muted hint">Match UniFi clients by MAC and choose, field by field, what to overwrite.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => loadM.mutate()} disabled={busy}>{loadM.isPending ? 'Loading…' : rows ? 'Reload preview' : 'Load update preview'}</button>
          <button className="btn primary" onClick={() => commitM.mutate(selectedRows)} disabled={busy || fieldCount === 0}>
            {commitM.isPending ? 'Applying…' : `Commit (${fieldCount} fields)`}
          </button>
        </div>
      </div>

      {note && <div className={`import-note ${note.tone}`} role={note.tone === 'bad' ? 'alert' : 'status'}>{note.text}</div>}
      {loadM.isPending && <Spinner label="Contacting UniFi controller… this can take a few seconds." />}
      {rows && rows.length === 0 && !loadM.isPending && <Empty>The controller returned no clients.</Empty>}

      {rows && rows.length > 0 && (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'changed', label: 'Changed', count: counts.changed },
            { id: 'new', label: 'New', count: counts.new },
            { id: 'unchanged', label: 'Unchanged', count: counts.unchanged },
          ]} />
          <div className="import-toolbar">
            <TextInput className="search" type="search" placeholder="Filter clients…" aria-label="Filter clients" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm ghost" disabled={busy} onClick={() => setRows((c) => c && c.map((r) => (r.kind === 'unchanged' ? r : setRowApply(r, true))))}>Select all changes</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => setRows((c) => c && c.map((r) => setRowApply(r, false)))}>Select none</button>
            <span className="muted small push">{visible.length} shown · {selectedRows.length} rows selected</span>
          </div>
          <div className="card flush">
            <table className="table import-table">
              <thead>
                <tr>
                  <th className="w1">
                    <Check label="Apply all shown" checked={allOn} indeterminate={someOn} disabled={eligible.length === 0}
                      onChange={(v) => setRows((c) => c && c.map((r) => (eligible.some((e) => e.mac === r.mac) ? setRowApply(r, v) : r)))} />
                  </th>
                  <th className="w1"><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Details</span></th>
                  <th>Online</th><th>MAC</th><th>Name</th><th>Hostname</th><th>IP</th><th>Conn</th><th>Where</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={9} className="muted">Nothing in this tab.</td></tr>}
                {visible.map((r) => (
                  <UpdateRowView key={r.mac} r={r} field={field}
                    onApply={(v) => patch(r.mac, (x) => setRowApply(x, v))}
                    onToggle={() => patch(r.mac, (x) => ({ ...x, expanded: !x.expanded }))}
                    onField={(k, v) => patch(r.mac, (x) => ({ ...x, applied: v ? [...new Set([...x.applied, k])] : x.applied.filter((a) => a !== k) }))}
                    onAllFields={(v) => patch(r.mac, (x) => ({ ...x, applied: v ? changedKeys(x) : [] }))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!rows && !loadM.isPending && !note && <Empty>Nothing loaded yet. Use “Load update preview” to fetch from the controller.</Empty>}
    </section>
  );
}

function UpdateRowView({ r, field, onApply, onToggle, onField, onAllFields }: {
  r: URow; field: (r: URow, k: string) => URow['fields'][number];
  onApply: (v: boolean) => void; onToggle: () => void; onField: (k: string, v: boolean) => void; onAllFields: (v: boolean) => void;
}) {
  const locked = r.kind === 'unchanged';
  const changed = r.fields.filter((f) => f.changed);
  const allF = changed.length > 0 && changed.every((f) => r.applied.includes(f.key));
  const someF = changed.some((f) => r.applied.includes(f.key));
  const cell = (k: string) => { const f = field(r, k); return <FieldVal v={f.incoming} changed={f.changed} />; };
  return (
    <>
      <tr className={locked ? 'is-unchanged' : ''}>
        <td><Check label={`Apply ${r.mac}`} checked={r.applyRow} disabled={locked} onChange={onApply} /></td>
        <td>
          <button className="import-expand" onClick={onToggle} aria-expanded={r.expanded} aria-label={r.expanded ? 'Hide field details' : 'Show field details'}>{r.expanded ? '▾' : '▸'}</button>
        </td>
        <td><OnlineBadge on={r.isOnline} /></td>
        <td className="mono">{r.mac}</td>
        <td>{cell('name')}</td>
        <td>{cell('hostname')}</td>
        <td className="mono">{cell('ipAddress')}</td>
        <td>{r.connectionType ? <Badge>{r.connectionType}</Badge> : '—'}</td>
        <td className="cell-wrap">{dash(r.connectionDetail)}</td>
      </tr>
      {r.expanded && (
        <tr className="import-fields">
          <td colSpan={9}>
            <table className="import-fields-table">
              <thead>
                <tr>
                  <th className="w1">
                    <Check label="Apply all changed fields" checked={allF} indeterminate={someF} disabled={!r.applyRow || locked} onChange={onAllFields} />
                  </th>
                  <th>Field</th><th>Current (DB)</th><th>Incoming (UniFi)</th>
                </tr>
              </thead>
              <tbody>
                {r.fields.map((f) => (
                  <tr key={f.key}>
                    <td><Check label={`Apply ${f.label}`} checked={r.applied.includes(f.key)} disabled={!r.applyRow || !f.changed || locked} onChange={(v) => onField(f.key, v)} /></td>
                    <td>{f.label}</td>
                    <td>{dash(f.current)}</td>
                    <td><FieldVal v={f.incoming} changed={f.changed} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/* ---------- connection card ---------- */
function ConnectionCard() {
  const [status, setStatus] = useState<Note>(null);
  const m = useMutation({
    mutationFn: importApi.test,
    onMutate: () => setStatus(null),
    onSuccess: (r) => setStatus({ tone: 'ok', text: r.message }),
    onError: (e: Error) => setStatus({ tone: 'bad', text: `Connection error: ${e.message}` }),
  });
  return (
    <section className="card import-conn">
      <div className="grow">
        <h2 style={{ margin: 0 }}>Connection</h2>
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          Uses the controller configured in <a href="/settings">Settings</a>. Calls are spaced at least 15 seconds apart to avoid UniFi rate limits.
        </p>
      </div>
      {status && <span className="import-status" role="status"><Badge tone={status.tone}>{status.tone === 'ok' ? 'Connected' : 'Failed'}</Badge><span className={status.tone === 'bad' ? 'bad-text' : ''}>{status.text}</span></span>}
      <button className="btn" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? 'Testing…' : 'Test connection'}</button>
    </section>
  );
}

/* ---------- page ---------- */
type TabId = 'subnets' | 'devices' | 'clients' | 'update';

export default function UnifiImport() {
  const can = useCan();
  const [tab, setTab] = useState<TabId>('subnets');
  const tabs = useMemo(() => [
    { id: 'subnets' as const, label: 'Subnets' },
    { id: 'devices' as const, label: 'UniFi devices' },
    { id: 'clients' as const, label: 'Clients' },
    { id: 'update' as const, label: 'Client update' },
  ], []);

  if (!can.edit) {
    return (
      <>
        <PageHeader title="UniFi import" />
        <div className="error" role="alert">Viewer accounts cannot access UniFi import.</div>
      </>
    );
  }

  const show = (id: TabId) => ({ display: tab === id ? undefined : 'none' });
  return (
    <>
      <PageHeader title="UniFi import" sub="Pull subnets, devices and clients from your UniFi controller" />
      <ol className="import-steps" aria-label="Recommended order for a fresh install">
        <li>Import subnets</li><li>Import UniFi devices</li><li>Import clients</li>
      </ol>
      <ConnectionCard />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {/* panels stay mounted so loaded previews and selections survive tab switches */}
      <div style={show('subnets')}><SubnetsPanel /></div>
      <div style={show('devices')}><InfraPanel /></div>
      <div style={show('clients')}><ClientsPanel /></div>
      <div style={show('update')}><UpdatePanel /></div>
    </>
  );
}
