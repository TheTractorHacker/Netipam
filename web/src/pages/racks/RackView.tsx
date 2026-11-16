import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, ErrorNote, Select, Spinner } from '../../components/kit';
import { Empty, PageHeader } from '../../components/ui';
import { useCan } from '../../auth';
import { racksApi, statusOf, type RackDevice } from './api';
import AssignmentTable, { DeviceName, StatusDot } from './AssignmentTable';
import PlacementModal from './PlacementModal';
import './racks.css';

const ROW = 30;

/** Greedy lane assignment so overlapping devices sit side by side instead of hiding each other. */
function layout(placed: RackDevice[]) {
  const sorted = [...placed].sort((a, b) => a.uPosition! - b.uPosition! || a.name.localeCompare(b.name));
  const laneEnds: number[] = [];
  const out = new Map<number, { lane: number }>();
  let clusterEnd = -1;
  let clusterIds: number[] = [];
  let clusterLanes = 0;
  const lanesOf = new Map<number, number>();
  const flush = () => { clusterIds.forEach((id) => lanesOf.set(id, clusterLanes)); clusterIds = []; clusterLanes = 0; laneEnds.length = 0; };
  for (const d of sorted) {
    const start = d.uPosition!;
    const end = start + d.uSize! - 1;
    if (start > clusterEnd) { flush(); clusterEnd = -1; }
    let lane = laneEnds.findIndex((e) => e < start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); } else laneEnds[lane] = end;
    out.set(d.id, { lane });
    clusterIds.push(d.id);
    clusterLanes = Math.max(clusterLanes, laneEnds.length);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return new Map([...out].map(([id, v]) => [id, { lane: v.lane, lanes: lanesOf.get(id) ?? 1 }]));
}

export default function RackView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { edit } = useCan();
  const list = useQuery({ queryKey: ['racks', 'list'], queryFn: racksApi.list });
  const racks = list.data?.racks ?? [];
  const rackId = id ? Number(id) : racks[0]?.id;
  const detail = useQuery({
    queryKey: ['racks', 'detail', rackId],
    queryFn: () => racksApi.detail(rackId!),
    enabled: rackId !== undefined && !Number.isNaN(rackId),
  });
  const [assign, setAssign] = useState<{ u?: number } | null>(null);
  const [editing, setEditing] = useState<RackDevice | null>(null);

  const d = detail.data;
  const placed = useMemo(() => d?.devices.filter((x) => x.placed) ?? [], [d]);
  const unplaced = d?.devices.filter((x) => !x.placed) ?? [];
  const lanes = useMemo(() => layout(placed), [placed]);
  const occupied = useMemo(() => {
    const s = new Set<number>();
    placed.forEach((p) => { for (let u = p.uPosition!; u < p.uPosition! + p.uSize!; u++) s.add(u); });
    return s;
  }, [placed]);

  const header = (
    <PageHeader
      title="Rack view"
      sub="Front elevation with U positions."
      actions={
        <>
          <Link className="btn" to="/racks">All racks</Link>
          {racks.length > 0 && (
            <Select aria-label="Rack" value={rackId ?? ''} onChange={(e) => nav(`/racks/view/${e.target.value}`)} style={{ width: 'auto', minWidth: 160 }}>
              {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
        </>
      }
    />
  );

  if (list.isLoading) return <>{header}<Spinner /></>;
  if (list.error) return <>{header}<ErrorNote error={list.error} /></>;
  if (racks.length === 0) return <>{header}<Empty>No racks yet. <Link to="/racks">Create one on the Racks page</Link>.</Empty></>;
  if (detail.isLoading) return <>{header}<Spinner /></>;
  if (detail.error) return <>{header}<ErrorNote error={detail.error} /></>;
  if (!d) return <>{header}<Empty>Select a rack to view layout.</Empty></>;

  const total = d.totalUnits;
  const units = Array.from({ length: total }, (_, i) => total - i);
  const overlaps = d.devices.filter((x) => x.overlap).length;

  return (
    <>
      {header}
      <div className="racks-title">
        <h2>{d.rack.name}</h2>
        {d.rack.location && <span className="muted">{d.rack.location}</span>}
        {d.rack.rackUnits !== null && <Badge>{d.rack.rackUnits}U</Badge>}
        {overlaps > 0 && <Badge tone="bad">{overlaps} overlapping</Badge>}
        {edit && <button className="btn primary sm racks-assign-btn" onClick={() => setAssign({})}>Assign device</button>}
      </div>
      {d.rack.description && <p className="muted">{d.rack.description}</p>}

      <div className="racks-layout">
        <div className="card racks-shell">
          <div className="racks-elev" style={{ height: total * ROW }}>
            <div className="racks-labels">
              {units.map((u) => <div key={u} className="racks-label" style={{ height: ROW }}>U{u}</div>)}
            </div>
            <div className="racks-body">
              {units.map((u) => {
                const free = !occupied.has(u);
                return edit && free ? (
                  <button key={u} className="racks-slot free" style={{ height: ROW }} onClick={() => setAssign({ u })} aria-label={`Assign a device at U${u}`}>
                    <span className="racks-plus" aria-hidden>+</span>
                  </button>
                ) : (
                  <div key={u} className="racks-slot" style={{ height: ROW }} />
                );
              })}
              {placed.map((p) => {
                const l = lanes.get(p.id) ?? { lane: 0, lanes: 1 };
                const meta = [p.type, p.manufacturer, p.model].filter(Boolean).join(' · ');
                return (
                  <div
                    key={p.id}
                    className={'racks-block' + (p.overlap ? ' overlap' : '') + (p.uSize! === 1 ? ' one' : '')}
                    style={{
                      bottom: (p.uPosition! - 1) * ROW,
                      height: p.uSize! * ROW,
                      left: `calc(6px + (100% - 12px) * ${l.lane / l.lanes})`,
                      width: `calc((100% - 12px) / ${l.lanes})`,
                    }}
                    title={`${p.name} · U${p.uPosition}${p.uSize! > 1 ? `–${p.uPosition! + p.uSize! - 1}` : ''} · ${statusOf(p)}${p.overlap ? ' · overlaps another device' : ''}`}
                  >
                    <StatusDot d={p} />
                    <div className="racks-block-text">
                      <strong><DeviceName d={p} /></strong>
                      {meta && <span className="muted"> {meta}</span>}
                    </div>
                    <span className="racks-size">{p.uSize}U</span>
                    {edit && <button className="racks-block-edit" onClick={() => setEditing(p)} aria-label={`Edit placement of ${p.name}`}>Edit</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="racks-side">
          {unplaced.length > 0 && (
            <div className="card">
              <h3 className="racks-h3">Unplaced (missing U position/size)</h3>
              <ul className="racks-unplaced">
                {unplaced.map((u) => (
                  <li key={u.id}>
                    <span>{u.name}</span>
                    {edit && <button className="btn sm" onClick={() => setEditing(u)}>Place</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h3 className="racks-h3">Devices in this rack</h3>
          <AssignmentTable rackId={d.rack.id} devices={d.devices} totalUnits={total} />
        </div>
      </div>

      {assign && <PlacementModal rackId={d.rack.id} totalUnits={total} devices={d.devices} initialU={assign.u} onClose={() => setAssign(null)} />}
      {editing && <PlacementModal rackId={d.rack.id} totalUnits={total} devices={d.devices} existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
