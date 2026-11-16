import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan } from '../../auth';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ConfirmDialog, ErrorNote, Spinner, useDebounced, useToast } from '../../components/kit';
import { devicesApi, type ColumnPage, type DeviceRow, type Kind, type Options } from './api';
import { ConnIcon, Dash, Icon, StatusDot, ipSortKey } from './util';
import DeviceForm from './DeviceForm';
import DeviceDrawer from './DeviceDrawer';
import ColumnPicker from './ColumnPicker';
import './devices.css';

/* ---------- filter state (per-viewer convenience, kept in localStorage) ---------- */
interface Filters {
  status: 'all' | 'online' | 'offline';
  hideIgnored: boolean; hideDhcp: boolean;
  type: string; location: string; subnet: string;
  view: 'cards' | 'table';
  sort: string; dir: 'asc' | 'desc';
}
const DEFAULTS: Filters = {
  status: 'all', hideIgnored: true, hideDhcp: false, type: '', location: '', subnet: '',
  view: 'cards', sort: 'Name', dir: 'asc',
};
function loadFilters(kind: Kind): Filters {
  try {
    const raw = localStorage.getItem(`netipam.devices.filters.${kind}`);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return DEFAULTS;
}
function saveFilters(kind: Kind, f: Filters) {
  try { localStorage.setItem(`netipam.devices.filters.${kind}`, JSON.stringify(f)); } catch { /* ignore */ }
}

const UNASSIGNED = '__none';
const CARD_STEP = 120;
const ROW_STEP = 300;

/* ---------- columns ---------- */
interface Col {
  key: string; label: string; kinds: Kind[];
  sort?: (d: DeviceRow) => string | number;
  th?: string;
  cell: (d: DeviceRow, ctx: { lastSeen: boolean }) => ReactNode;
}
const str = (v: string | null | undefined) => (v ?? '').toLowerCase();
const COLS: Col[] = [
  { key: 'Status', label: 'Status', kinds: ['device', 'client'], th: 'w1', sort: (d) => (!d.isStatusTracked ? 0 : d.isOnline ? 2 : 1), cell: (d, c) => <StatusDot d={d} withLastSeen={c.lastSeen} /> },
  { key: 'Name', label: 'Name', kinds: ['device', 'client'], sort: (d) => str(d.name), cell: (d) => <NameCell d={d} /> },
  { key: 'Type', label: 'Type', kinds: ['device', 'client'], sort: (d) => str(d.type), cell: (d) => <Dash v={d.type} /> },
  { key: 'Hostname', label: 'Hostname', kinds: ['device', 'client'], sort: (d) => str(d.hostname), cell: (d) => <Dash v={d.hostname} /> },
  { key: 'IP', label: 'IP', kinds: ['device', 'client'], sort: (d) => ipSortKey(d.ipAddress), cell: (d) => <IpCell d={d} /> },
  { key: 'Subnet', label: 'Subnet', kinds: ['device', 'client'], sort: (d) => str(d.subnet), cell: (d) => d.subnet ? <a href={`/subnets/${d.subnetId}/ips`} onClick={(e) => e.stopPropagation()}>{d.subnet}</a> : <Dash v={null} /> },
  { key: 'MAC', label: 'MAC', kinds: ['device', 'client'], sort: (d) => str(d.macAddress), cell: (d) => d.macAddress ? <span className="mono muted">{d.macAddress}</span> : <Dash v={null} /> },
  { key: 'Conn', label: 'Conn', kinds: ['device', 'client'], th: 'w1', sort: (d) => str(d.connectionType), cell: (d) => <ConnIcon d={d} /> },
  { key: 'Upstream', label: 'Upstream', kinds: ['device', 'client'], sort: (d) => str(d.upstream), cell: (d) => <Dash v={d.upstream} /> },
  { key: 'Host', label: 'Host', kinds: ['client'], sort: (d) => str(d.hostDeviceName), cell: (d) => <Dash v={d.hostDeviceName} /> },
  { key: 'Location', label: 'Location', kinds: ['device', 'client'], sort: (d) => str(d.location), cell: (d) => <Dash v={d.location} /> },
  { key: 'Rack', label: 'Rack', kinds: ['device', 'client'], sort: (d) => str(d.rackName) + String(d.rackUPosition ?? 0).padStart(3, '0'), cell: (d) => <Dash v={d.rack} /> },
  { key: 'Asset', label: 'Asset #', kinds: ['device'], sort: (d) => str(d.assetNumber), cell: (d) => <Dash v={d.assetNumber} /> },
  { key: 'Manufacturer', label: 'Manufacturer', kinds: ['device', 'client'], sort: (d) => str(d.manufacturer), cell: (d) => <Dash v={d.manufacturer} /> },
  { key: 'Model', label: 'Model', kinds: ['device', 'client'], sort: (d) => str(d.model), cell: (d) => <Dash v={d.model} /> },
  { key: 'OS', label: 'OS', kinds: ['device', 'client'], sort: (d) => str(d.operatingSystem), cell: (d) => <Dash v={d.operatingSystem} /> },
  { key: 'Source', label: 'Source', kinds: ['device'], sort: (d) => str(d.source), cell: (d) => <Dash v={d.source} /> },
  { key: 'UsedNew', label: 'Used/New', kinds: ['device'], sort: (d) => str(d.usedNew), cell: (d) => <Dash v={d.usedNew} /> },
  { key: 'Date', label: 'Date', kinds: ['device'], sort: (d) => d.sourceDate ?? '', cell: (d) => <Dash v={d.sourceDateText} /> },
];
const ACTIONS_KEY = 'Actions';
const sortLabel = (k: string) => COLS.find((c) => c.key === k)?.label ?? k;

function NameCell({ d }: { d: DeviceRow }) {
  return (
    <span className="dev-name">
      <Link to={`?open=${d.id}`} className="strong dev-name-link" onClick={(e) => e.stopPropagation()}>{d.name}</Link>
      {d.isCritical && <Badge tone="warn">critical</Badge>}
      {d.accessHref && (
        <a href={d.accessHref} target="_blank" rel="noopener noreferrer" className="dev-ext" title={`Open ${d.accessLink}`} aria-label={`Open ${d.name} in a new tab`} onClick={(e) => e.stopPropagation()}>
          {Icon.external()}
        </a>
      )}
    </span>
  );
}
function IpCell({ d }: { d: DeviceRow }) {
  if (d.ipDisplay) return <span className="mono" title={d.ipTooltip ?? undefined}>{d.ipDisplay}</span>;
  return d.ipAddress ? <span className="mono">{d.ipAddress}</span> : <Dash v={null} />;
}

/* ---------- page ---------- */
export default function Devices({ kind, title }: { kind: Kind; title: string }) {
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => loadFilters(kind));
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200).trim().toLowerCase();
  const [limit, setLimit] = useState(0);
  const [form, setForm] = useState<{ device?: DeviceRow; kind: Kind; ip?: string } | null>(null);
  const [del, setDel] = useState<DeviceRow | null>(null);
  const [picker, setPicker] = useState(false);

  const optionsQ = useQuery({ queryKey: ['devices', 'options'], queryFn: devicesApi.options, staleTime: 30_000 });
  const opts: Options | undefined = optionsQ.data;
  const refreshMs = (opts?.uiAutoRefreshSeconds ?? 0) * 1000;
  const lastSeen = opts?.showLastSeenTooltips ?? true;

  const listQ = useQuery({
    queryKey: ['devices', 'list', kind],
    queryFn: () => devicesApi.list(kind),
    refetchInterval: refreshMs > 0 ? refreshMs : false,
  });

  const page: ColumnPage = kind === 'device' ? 'Devices' : 'Clients';
  const colsQ = useQuery({ queryKey: ['devices', 'columns', page], queryFn: () => devicesApi.columns(page) });
  const cols = useMemo(() => COLS.filter((c) => c.kinds.includes(kind)), [kind]);
  const pickerCols = useMemo(() => [...cols.map((c) => ({ key: c.key, label: c.label })), { key: ACTIONS_KEY, label: 'Actions' }], [cols]);
  const visible = colsQ.data?.columns ?? {};
  const show = (key: string) => (colsQ.data?.saved ? visible[key] !== false : true);

  const saveCols = useMutation({
    mutationFn: (v: Record<string, boolean>) => devicesApi.saveColumns(page, pickerCols.map((c) => ({ key: c.key, visible: v[c.key] !== false }))),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['devices', 'columns', page] }); setPicker(false); toast('Columns saved.'); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const remove = useMutation({
    mutationFn: (d: DeviceRow) => devicesApi.remove(d.id),
    onSuccess: async (_r, d) => {
      toast(`Deleted ${d.isDevice ? 'device' : 'client'} '${d.name}'.`);
      setDel(null);
      if (openId === d.id) closeDrawer();
      await qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const patch = (p: Partial<Filters>) => { setFilters((f) => { const n = { ...f, ...p }; saveFilters(kind, n); return n; }); setLimit(0); };

  // Drawer is addressed by ?open=<id> so the list keeps its state.
  const openId = Number(params.get('open')) || null;
  const closeDrawer = useCallback(() => setParams((p) => { p.delete('open'); return p; }, { replace: true }), [setParams]);

  const openRow = (id: number) => setParams((p) => { p.set('open', String(id)); return p; });

  // Deep link: ?add=device|client&ip=1.2.3.4 opens the add dialog (used by discovery).
  useEffect(() => {
    const add = params.get('add');
    if (add && can.edit) {
      setForm({ kind: add === 'client' ? 'client' : add === 'device' ? 'device' : kind, ip: params.get('ip') ?? undefined });
      setParams((p) => { p.delete('add'); p.delete('ip'); return p; }, { replace: true });
    }
  }, [params, can.edit, setParams]);

  // Deep link: ?q= pre-fills the search box.
  useEffect(() => {
    const qp = params.get('q');
    if (qp !== null) {
      setQ(qp);
      setParams((p) => { p.delete('q'); return p; }, { replace: true });
    }
  }, [params, setParams]);

  const closeForm = useCallback(() => setForm(null), []);
  const closeDel = useCallback(() => setDel(null), []);
  const closePicker = useCallback(() => setPicker(false), []);

  const all = listQ.data ?? [];
  const typeOptions = (opts?.clientTypes ?? []).filter((t) => (kind === 'device' ? t.isDevice : !t.isDevice));

  const rows = useMemo(() => {
    let r = all;
    if (filters.status !== 'all') {
      const on = filters.status === 'online';
      r = r.filter((d) => !d.isStatusTracked || (on ? d.isOnline : !d.isOnline));
    }
    if (filters.hideIgnored) r = r.filter((d) => !d.ignoreOffline);
    if (filters.hideDhcp) r = r.filter((d) => !d.inDhcp);
    if (filters.type) r = r.filter((d) => (filters.type === UNASSIGNED ? d.clientTypeId === null : String(d.clientTypeId) === filters.type));
    if (filters.location) r = r.filter((d) => (filters.location === UNASSIGNED ? d.locationId === null && !d.location : String(d.locationId) === filters.location));
    if (filters.subnet) r = r.filter((d) => (filters.subnet === UNASSIGNED ? d.subnetId === null : String(d.subnetId) === filters.subnet));
    if (dq) {
      r = r.filter((d) =>
        [d.name, d.ipAddress, d.macAddress, d.hostname, d.subnet, d.location, d.rackName].some((v) => (v ?? '').toLowerCase().includes(dq)));
    }
    const sorter = (COLS.find((c) => c.key === filters.sort) ?? COLS[1]).sort!;
    const m = filters.dir === 'asc' ? 1 : -1;
    const byName = (a: DeviceRow, b: DeviceRow) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    r = [...r].sort((a, b) => {
      const x = sorter(a), y = sorter(b);
      if (x < y) return -m;
      if (x > y) return m;
      return byName(a, b);
    });
    return r;
  }, [all, filters, dq]);

  const filtered = dq !== '' || filters.status !== 'all' || filters.hideDhcp || !!filters.type || !!filters.location || !!filters.subnet || !filters.hideIgnored;
  const clearAll = () => { setQ(''); patch({ status: 'all', hideDhcp: false, hideIgnored: true, type: '', location: '', subnet: '' }); };

  const shownCount = limit || (filters.view === 'cards' ? CARD_STEP : ROW_STEP);
  const shown = rows.slice(0, shownCount);
  const sortBy = (key: string) => patch({ sort: key, dir: filters.sort === key && filters.dir === 'asc' ? 'desc' : 'asc' });
  const visibleCols = cols.filter((c) => show(c.key));
  const showActions = show(ACTIONS_KEY);
  const noun = kind === 'device' ? 'device' : 'client';

  const openEdit = (d: DeviceRow) => setForm({ device: d, kind: d.isDevice ? 'device' : 'client' });
  const exportLinks = kind === 'device'
    ? [{ href: '/export/devices.xlsx', label: 'Export devices' }, { href: '/export/all.xlsx', label: 'Export all' }]
    : [{ href: '/export/clients.xlsx', label: 'Export clients' }, { href: '/export/all.xlsx', label: 'Export all' }];

  return (
    <>
      <PageHeader
        title={title}
        sub={listQ.data ? `${rows.length.toLocaleString()} of ${all.length.toLocaleString()}` : undefined}
        actions={
          <>
            <details className="dev-menu">
              <summary className="btn ghost">{Icon.download()} Export</summary>
              <div className="dev-menu-list">{exportLinks.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</div>
            </details>
            {can.edit && (
              <>
                <button className={'btn' + (kind === 'client' ? ' primary' : '')} onClick={() => setForm({ kind: 'client' })}>{Icon.plus()} Add client</button>
                <button className={'btn' + (kind === 'device' ? ' primary' : '')} onClick={() => setForm({ kind: 'device' })}>{Icon.plus()} Add device</button>
              </>
            )}
          </>
        }
      />

      <div className="toolbar dev-toolbar">
        <input className="search" type="search" placeholder="Search name, IP, MAC, hostname, subnet, rack…" aria-label={`Search ${title.toLowerCase()}`} value={q} onChange={(e) => { setQ(e.target.value); setLimit(0); }} />
        <div className="seg" role="group" aria-label="Status filter">
          {(['all', 'online', 'offline'] as const).map((s) => (
            <button key={s} className={filters.status === s ? 'on' : ''} aria-pressed={filters.status === s} onClick={() => patch({ status: s })}>{s}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="View">
          <button className={filters.view === 'cards' ? 'on' : ''} aria-pressed={filters.view === 'cards'} title="Cards" aria-label="Card view" onClick={() => patch({ view: 'cards' })}>{Icon.grid()}</button>
          <button className={filters.view === 'table' ? 'on' : ''} aria-pressed={filters.view === 'table'} title="Table" aria-label="Table view" onClick={() => patch({ view: 'table' })}>{Icon.table()}</button>
        </div>
        {filters.view === 'table' && (
          <button className="btn ghost" onClick={() => setPicker(true)} title="Choose columns">{Icon.columns()} Columns</button>
        )}
      </div>

      <div className="dev-filters">
        <label className="dev-filter">
          <span>Type</span>
          <select className="select" value={filters.type} onChange={(e) => patch({ type: e.target.value })}>
            <option value="">All types</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="dev-filter">
          <span>Location</span>
          <select className="select" value={filters.location} onChange={(e) => patch({ location: e.target.value })}>
            <option value="">All locations</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {(opts?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="dev-filter">
          <span>Subnet</span>
          <select className="select" value={filters.subnet} onChange={(e) => patch({ subnet: e.target.value })}>
            <option value="">All subnets</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {(opts?.subnets ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {filters.view === 'cards' && (
          <label className="dev-filter">
            <span>Sort</span>
            <select className="select" value={`${filters.sort}:${filters.dir}`} onChange={(e) => { const [s, d] = e.target.value.split(':'); patch({ sort: s, dir: d as 'asc' | 'desc' }); }}>
              <option value="Name:asc">Name A-Z</option>
              <option value="Name:desc">Name Z-A</option>
              <option value="IP:asc">IP ascending</option>
              <option value="IP:desc">IP descending</option>
              <option value="Status:asc">Offline first</option>
              <option value="Status:desc">Online first</option>
              {!['Name', 'IP', 'Status'].includes(filters.sort) && (
                <>
                  <option value={`${filters.sort}:asc`}>{sortLabel(filters.sort)} A-Z</option>
                  <option value={`${filters.sort}:desc`}>{sortLabel(filters.sort)} Z-A</option>
                </>
              )}
            </select>
          </label>
        )}
        <label className="check"><input type="checkbox" checked={filters.hideIgnored} onChange={(e) => patch({ hideIgnored: e.target.checked })} /> Hide ignored</label>
        <label className="check"><input type="checkbox" checked={filters.hideDhcp} onChange={(e) => patch({ hideDhcp: e.target.checked })} /> Hide DHCP</label>
        {filtered && <button className="btn link-btn" onClick={clearAll}>Clear filters</button>}
      </div>

      {listQ.isLoading && <Spinner />}
      {listQ.error && <ErrorNote error={listQ.error} />}

      {listQ.data && all.length === 0 && (
        <Empty>
          <p className="strong">No {noun}s yet.</p>
          <p>Add one by hand{can.edit ? '' : ' (needs Editor access)'}, or import from UniFi.</p>
          <div className="row dev-empty-actions">
            {can.edit && <button className="btn primary" onClick={() => setForm({ kind })}>{Icon.plus()} Add {noun}</button>}
            <a className="btn" href="/unifi-import">UniFi import</a>
            <a className="btn" href="/settings">Settings</a>
          </div>
        </Empty>
      )}

      {listQ.data && all.length > 0 && rows.length === 0 && (
        <Empty>
          <p>No {noun}s match these filters.</p>
          <button className="btn" onClick={clearAll}>Clear filters</button>
        </Empty>
      )}

      {rows.length > 0 && filters.view === 'cards' && (
        <div className="dev-grid">
          {shown.map((d) => <DeviceCard key={d.id} d={d} lastSeen={lastSeen} canEdit={can.edit} onEdit={openEdit} onDelete={setDel} />)}
        </div>
      )}

      {rows.length > 0 && filters.view === 'table' && (
        <div className="card flush dev-tablewrap">
          <table className="table clickable dev-table">
            <thead>
              <tr>
                {visibleCols.map((c) => {
                  const active = filters.sort === c.key;
                  return (
                    <th key={c.key} className={c.th} aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      {c.key === 'Status' || c.key === 'Conn'
                        ? <button className="dev-th" onClick={() => sortBy(c.key)} title={`Sort by ${c.label}`}>{c.label}{active && <span aria-hidden>{filters.dir === 'asc' ? ' ▲' : ' ▼'}</span>}</button>
                        : <button className="dev-th" onClick={() => sortBy(c.key)}>{c.label}{active && <span aria-hidden>{filters.dir === 'asc' ? ' ▲' : ' ▼'}</span>}</button>}
                    </th>
                  );
                })}
                {showActions && <th className="w1"><span className="dev-sr">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} tabIndex={0} aria-label={`${d.name}, open details`}
                  onClick={() => openRow(d.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRow(d.id); } }}>
                  {visibleCols.map((c, i) => (
                    <td key={c.key} className={c.th}>
                      {c.cell(d, { lastSeen })}
                      {i === 0 && (!showActions || !show('Name')) && d.accessHref && (
                        <a href={d.accessHref} target="_blank" rel="noopener noreferrer" className="dev-ext dev-ext-lone" title={`Open ${d.accessLink}`} aria-label={`Open ${d.name} in a new tab`} onClick={(e) => e.stopPropagation()}>{Icon.external()}</a>
                      )}
                    </td>
                  ))}
                  {showActions && (
                    <td className="w1" onClick={(e) => e.stopPropagation()}>
                      <RowActions d={d} canEdit={can.edit} onEdit={openEdit} onDelete={setDel} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > shown.length && (
        <div className="dev-more">
          <button className="btn" onClick={() => setLimit(shownCount + (filters.view === 'cards' ? CARD_STEP : ROW_STEP))}>
            Show more ({(rows.length - shown.length).toLocaleString()} left)
          </button>
        </div>
      )}

      {openId !== null && (
        <DeviceDrawer
          id={openId} canEdit={can.edit} withLastSeen={lastSeen}
          onClose={closeDrawer} onEdit={openEdit} onDelete={setDel}
        />
      )}

      {form && (
        <DeviceForm
          device={form.device} kind={form.kind} initialIp={form.ip}
          onClose={closeForm}
          onSaved={() => setForm(null)}
        />
      )}

      {del && (
        <ConfirmDialog
          title={`Delete ${del.isDevice ? 'device' : 'client'}?`}
          message={<>Are you sure you want to delete <strong>{del.name}</strong>? This also removes its history.</>}
          onConfirm={async () => { await remove.mutateAsync(del).catch(() => undefined); }}
          onClose={closeDel}
        />
      )}

      {picker && (
        <ColumnPicker
          columns={pickerCols}
          visible={colsQ.data?.saved ? visible : {}}
          saving={saveCols.isPending}
          onSave={(v) => saveCols.mutate(v)}
          onClose={closePicker}
        />
      )}
    </>
  );
}

function RowActions({ d, canEdit, onEdit, onDelete }: { d: DeviceRow; canEdit: boolean; onEdit: (d: DeviceRow) => void; onDelete: (d: DeviceRow) => void }) {
  return (
    <div className="row-actions">
      {d.accessHref && <a className="btn ghost sm dev-ic" href={d.accessHref} target="_blank" rel="noopener noreferrer" title={`Open ${d.accessLink}`} aria-label={`Open ${d.name} in a new tab`}>{Icon.external()}</a>}
      {canEdit && <button className="btn ghost sm dev-ic" title="Edit" aria-label={`Edit ${d.name}`} onClick={() => onEdit(d)}>{Icon.edit()}</button>}
      <Link className="btn ghost sm dev-ic" to={`/devices/${d.id}/history`} title="History" aria-label={`History for ${d.name}`}>{Icon.history()}</Link>
      {canEdit && <button className="btn ghost sm dev-ic dev-ic-bad" title="Delete" aria-label={`Delete ${d.name}`} onClick={() => onDelete(d)}>{Icon.trash()}</button>}
    </div>
  );
}

function DeviceCard({ d, lastSeen, canEdit, onEdit, onDelete }: {
  d: DeviceRow; lastSeen: boolean; canEdit: boolean; onEdit: (d: DeviceRow) => void; onDelete: (d: DeviceRow) => void;
}) {
  const makeModel = [d.manufacturer, d.model].filter(Boolean).join(' ');
  const state = !d.isStatusTracked ? 'na' : d.isOnline ? 'on' : 'off';
  const via = d.upstream && d.upstream !== '-' ? d.upstream : null;
  return (
    <article className={`dev-card dev-${state}`}>
      <div className="dev-card-top">
        <StatusDot d={d} withLastSeen={lastSeen} />
        <NameCell d={d} />
        <span className="dev-card-conn"><ConnIcon d={d} /></span>
      </div>
      <div className="dev-card-sub">
        {d.type && <Badge tone="info">{d.type}</Badge>}
        {makeModel && <span className="muted">{makeModel}</span>}
      </div>
      <div className="mono dev-card-ip">
        {d.ipDisplay ? <span title={d.ipTooltip ?? undefined}>{d.ipDisplay}</span> : d.ipAddress ?? <span className="muted">no IP</span>}
      </div>
      <dl className="dev-meta">
        {d.macAddress && <><dt>MAC</dt><dd className="mono">{d.macAddress}</dd></>}
        {d.subnet && <><dt>Subnet</dt><dd><a href={`/subnets/${d.subnetId}/ips`}>{d.subnet}</a></dd></>}
        {d.location && <><dt>Location</dt><dd>{d.location}</dd></>}
        {via && <><dt>Via</dt><dd>{via}</dd></>}
      </dl>
      <div className="dev-card-actions"><RowActions d={d} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} /></div>
    </article>
  );
}
