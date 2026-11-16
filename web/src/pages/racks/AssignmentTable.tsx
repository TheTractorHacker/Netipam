import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, ConfirmDialog, useToast } from '../../components/kit';
import { useCan } from '../../auth';
import { racksApi, statusOf, statusTone, type RackDevice } from './api';
import PlacementModal from './PlacementModal';

export function StatusDot({ d }: { d: RackDevice }) {
  return <span className={`racks-dot ${statusTone(d)}`} title={statusOf(d)} role="img" aria-label={statusOf(d)} />;
}

export function DeviceName({ d }: { d: RackDevice }) {
  return d.link
    ? <a href={d.link} target="_blank" rel="noopener noreferrer" className="racks-devlink">{d.name}</a>
    : <span>{d.name}</span>;
}

/** Device rows for one rack, with placement edit and unassign actions. */
export default function AssignmentTable({ rackId, devices, totalUnits }: { rackId: number; devices: RackDevice[]; totalUnits: number }) {
  const { edit } = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<RackDevice | null>(null);
  const [removing, setRemoving] = useState<RackDevice | null>(null);

  const unassign = useMutation({
    mutationFn: (d: RackDevice) => racksApi.unassign(rackId, d.id),
    onSuccess: (_r, d) => { qc.invalidateQueries({ queryKey: ['racks'] }); toast(`Removed '${d.name}' from its rack.`); setRemoving(null); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const sorted = [...devices].sort((a, b) => (b.uPosition ?? -1) - (a.uPosition ?? -1) || a.name.localeCompare(b.name));
  if (sorted.length === 0) return <div className="muted small racks-pad">No devices assigned.</div>;

  return (
    <>
      <div className="card flush racks-assign">
        <table className="table">
          <thead>
            <tr><th>U</th><th>Device</th><th>Type</th><th>IP</th><th>Manufacturer</th><th>Model</th>{edit && <th aria-label="Actions" />}</tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.id} className={d.overlap ? 'racks-row-overlap' : undefined}>
                <td className="mono">
                  {d.placed
                    ? (d.uSize! > 1 ? `U${d.uPosition}–${d.uPosition! + d.uSize! - 1}` : `U${d.uPosition}`)
                    : <Badge tone="warn">Unplaced</Badge>}
                  {d.overlap && <> <Badge tone="bad">Overlap</Badge></>}
                </td>
                <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><StatusDot d={d} /><DeviceName d={d} />{d.placed && <span className="racks-size">{d.uSize}U</span>}</span></td>
                <td>{d.type ?? '—'}</td>
                <td className="mono">{d.ipAddress ?? '—'}</td>
                <td>{d.manufacturer ?? '—'}</td>
                <td>{d.model ?? '—'}</td>
                {edit && (
                  <td>
                    <div className="row-actions">
                      <button className="btn sm" onClick={() => setEditing(d)}>Placement</button>
                      <button className="btn sm" onClick={() => setRemoving(d)}>Remove</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small racks-pad">Device details are edited on the <Link to="/devices">Devices page</Link>. <Link to={`/racks/view/${rackId}`}>Open rack elevation</Link></p>
      {editing && <PlacementModal rackId={rackId} totalUnits={totalUnits} devices={devices} existing={editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title="Remove from rack?"
          message={`Remove '${removing.name}' from its rack assignment?`}
          confirmLabel="Remove"
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await unassign.mutateAsync(removing); }}
        />
      )}
    </>
  );
}
