import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { topologyApi, type TopoNode } from './api';
import { PageHeader, Empty } from '../../components/ui';
import { Spinner, ErrorNote, Badge, useDebounced } from '../../components/kit';
import { StatusDot, NameLink } from './shared';
import './topology.css';

const bandClass = (b: TopoNode['wifiBand']) => (b === '2.4' ? 'wifi-24' : b === '6' ? 'wifi-6' : 'wifi-5');

function LinkIcon({ n }: { n: TopoNode }) {
  return n.isWifi
    ? <span className={'topology-icon ' + bandClass(n.wifiBand)} title={n.connectionTooltip} role="img" aria-label={`Wi-Fi: ${n.connectionTooltip}`}>◠</span>
    : <span className="topology-icon wired" title={n.connectionTooltip} role="img" aria-label="Wired">⛓</span>;
}

interface Model {
  byId: Map<number, TopoNode>;
  children: Map<number, TopoNode[]>;
  roots: TopoNode[];
  unassigned: TopoNode[];
}

function buildModel(nodes: TopoNode[]): Model {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<number, TopoNode[]>();
  for (const n of nodes) {
    if (n.parentId == null) continue;
    const l = children.get(n.parentId) ?? [];
    l.push(n);
    children.set(n.parentId, l);
  }
  for (const l of children.values()) {
    l.sort((a, b) => (a.port ?? Infinity) - (b.port ?? Infinity) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  return {
    byId, children,
    roots: nodes.filter((n) => n.kind === 'root'),
    unassigned: nodes.filter((n) => n.kind === 'unassigned'),
  };
}

function computeSearch(m: Model, term: string) {
  const t = term.trim().toLowerCase();
  const matches = new Set<number>();
  const visible = new Set<number>();
  const expanded = new Set<number>();
  if (!t) return { active: false, matches, visible, expanded };
  for (const n of m.byId.values()) if (n.searchText.toLowerCase().includes(t)) matches.add(n.id);
  const addDesc = (id: number, seen: Set<number>) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of m.children.get(id) ?? []) { visible.add(c.id); addDesc(c.id, seen); }
  };
  for (const id of matches) {
    const seen = new Set<number>([id]);
    let p = m.byId.get(id)?.parentId ?? null;
    while (p != null && m.byId.has(p) && !seen.has(p)) {
      seen.add(p); visible.add(p); expanded.add(p);
      p = m.byId.get(p)!.parentId;
    }
    visible.add(id);
    if (m.children.has(id)) expanded.add(id);
    addDesc(id, new Set());
  }
  return { active: true, matches, visible, expanded };
}

function Row({ n, hasKids, open, onToggle, match, showParent }: {
  n: TopoNode; hasKids: boolean; open: boolean; onToggle: () => void; match: boolean; showParent?: boolean;
}) {
  const count = hasKids ? 1 : 0;
  return (
    <div className={'topology-row' + (match ? ' match' : '')}>
      {hasKids
        ? <button className="topology-toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${n.name}`} onClick={onToggle}>{open ? '▾' : '▸'}</button>
        : <span className="topology-toggle-spacer" />}
      <StatusDot d={n} />
      <LinkIcon n={n} />
      {n.port != null && <Badge tone="info">port {n.port}</Badge>}
      <NameLink name={n.name} href={n.accessHref} className={'topology-name' + (count ? '' : ' leaf')} />
      {n.type && <span className="topology-meta">{n.type}</span>}
      <span className="topology-ip">{n.ipAddress}</span>
      {n.isTopologyRoot && <Badge tone="ok">root</Badge>}
      {n.isHosted && <Badge>hosted</Badge>}
      {showParent && n.hostname && <span className="topology-meta hide-sm">{n.hostname}</span>}
      {showParent && (n.upstreamName || n.connectionDetail) && (
        <span className="topology-meta hide-sm">↑ {[n.upstreamName, n.connectionDetail].filter(Boolean).join(' | ')}</span>
      )}
    </div>
  );
}

export default function Topology() {
  const { data, isLoading, error } = useQuery({ queryKey: ['topology'], queryFn: topologyApi.topology });
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const model = useMemo(() => buildModel(data?.nodes ?? []), [data]);
  const search = useMemo(() => computeSearch(model, dq), [model, dq]);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const saved = useRef<Set<number> | null>(null);
  const initDone = useRef(false);

  useEffect(() => {
    if (data && !initDone.current) {
      initDone.current = true;
      setExpanded(new Set(model.roots.filter((r) => model.children.has(r.id)).map((r) => r.id)));
    }
  }, [data, model]);

  // Search auto-expands matching paths and restores the previous state when cleared (classic behaviour).
  useEffect(() => {
    if (search.active) {
      setExpanded((cur) => { if (!saved.current) saved.current = cur; return new Set(search.expanded); });
    } else if (saved.current) {
      setExpanded(saved.current);
      saved.current = null;
    }
  }, [search]);

  const toggle = (id: number) => setExpanded((cur) => {
    const nx = new Set(cur);
    if (!nx.delete(id)) nx.add(id);
    return nx;
  });
  const expandAll = () => setExpanded(new Set([...model.children.keys()]));
  const collapseAll = () => setExpanded(new Set());

  const roots = search.active ? model.roots.filter((r) => search.visible.has(r.id)) : model.roots;
  const unassigned = search.active ? model.unassigned.filter((u) => search.matches.has(u.id)) : model.unassigned;

  const renderNode = (n: TopoNode, trail: Set<number>): React.ReactNode => {
    const kids = trail.has(n.id) ? [] : model.children.get(n.id) ?? [];
    const open = expanded.has(n.id);
    const next = new Set(trail).add(n.id);
    return (
      <li key={n.id}>
        <Row n={n} hasKids={kids.length > 0} open={open} onToggle={() => toggle(n.id)} match={search.active && search.matches.has(n.id)} />
        {open && kids.length > 0 && <ul>{kids.map((c) => renderNode(c, next))}</ul>}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Network topology"
        sub={data ? `${data.nodes.length} devices` : undefined}
        actions={<a className="btn ghost" href="/export/topology.xlsx">Export .xlsx</a>}
      />
      <div className="toolbar">
        <input className="search" type="search" aria-label="Search topology" placeholder="Search (name, IP, hostname, type…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={collapseAll}>Collapse all</button>
        <button className="btn" onClick={expandAll}>Expand all</button>
      </div>
      <div className="topology-legend" aria-hidden>
        <span><span className="topology-icon wired">⛓</span> wired</span>
        <span><span className="topology-icon wifi-24">◠</span> Wi-Fi 2.4G</span>
        <span><span className="topology-icon wifi-5">◠</span> Wi-Fi 5G</span>
        <span><span className="topology-icon wifi-6">◠</span> Wi-Fi 6G</span>
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && roots.length === 0 && <Empty>No devices to display.</Empty>}
      {roots.length > 0 && (
        <div className="card topology-panel">
          <ul className="topology-tree">{roots.map((r) => renderNode(r, new Set()))}</ul>
        </div>
      )}

      {unassigned.length > 0 && (
        <details className="card flush topology-unassigned">
          <summary>Unassigned / Unknown ({unassigned.length})</summary>
          <div className="topology-unassigned-list">
            {[...unassigned].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((u) => (
              <Row key={u.id} n={u} hasKids={false} open={false} onToggle={() => {}} match={false} showParent />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
