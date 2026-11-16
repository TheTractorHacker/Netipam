import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ConfirmDialog, ErrorNote, Spinner, useToast } from '../../components/kit';
import { Empty, PageHeader } from '../../components/ui';
import { useCan } from '../../auth';
import { racksApi, type RackRow } from './api';
import AssignmentTable from './AssignmentTable';
import RackFormModal from './RackFormModal';
import './racks.css';

function Assignments({ rack }: { rack: RackRow }) {
  // Mounted only while the <details> is open, so closed racks cost no request.
  const q = useQuery({ queryKey: ['racks', 'detail', rack.id], queryFn: () => racksApi.detail(rack.id) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  const unplaced = q.data!.devices.filter((d) => !d.placed);
  return (
    <>
      <AssignmentTable rackId={rack.id} devices={q.data!.devices} totalUnits={q.data!.totalUnits} />
      {unplaced.length > 0 && <p className="muted small racks-pad">Missing U position/size: {unplaced.map((d) => d.name).join(', ')}</p>}
    </>
  );
}

export default function Racks() {
  const { edit } = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['racks', 'list'], queryFn: racksApi.list });
  const [form, setForm] = useState<RackRow | 'new' | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [deleting, setDeleting] = useState<RackRow | null>(null);

  const del = useMutation({
    mutationFn: (r: RackRow) => racksApi.remove(r.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['racks'] }); toast('Rack deleted.'); setDeleting(null); },
    onError: (e: Error) => { toast(e.message, 'bad'); setDeleting(null); },
  });

  const racks = q.data?.racks ?? [];

  const askDelete = (r: RackRow) => {
    if (r.deviceCount > 0) toast('Cannot delete: this rack is assigned to one or more devices.', 'bad');
    else setDeleting(r);
  };

  return (
    <>
      <PageHeader
        title="Racks"
        sub="Rack inventory, capacity and device assignments."
        actions={
          <>
            <Link className="btn" to="/racks/view">Rack view</Link>
            {edit && <button className="btn primary" onClick={() => setForm('new')}>Add rack</button>}
          </>
        }
      />
      {q.isLoading && <Spinner />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data && racks.length === 0 && <Empty>No racks yet.{edit && <> <button className="btn link-btn" onClick={() => setForm('new')}>Add the first rack</button>.</>}</Empty>}
      {racks.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Location</th><th>Description</th><th>Size (U)</th><th>Items</th><th>U used</th><th>U free</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {racks.map((r) => (
                <tr key={r.id}>
                  <td className="strong"><Link to={`/racks/view/${r.id}`}>{r.name}</Link></td>
                  <td>{r.location ?? '—'}</td>
                  <td className="muted">{r.description ?? '—'}</td>
                  <td className="num">{r.rackUnits ?? `Default (${q.data!.defaultUnits})`}</td>
                  <td className="num">{r.deviceCount}</td>
                  <td className="num">
                    <div className="racks-meter" title={`${r.usedUnits} of ${r.totalUnits} U used`}>
                      <span>{r.usedUnits}</span>
                      <div className="racks-bar"><div style={{ width: `${Math.min(100, (r.usedUnits / r.totalUnits) * 100)}%` }} /></div>
                    </div>
                  </td>
                  <td className="num">{r.freeUnits}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn sm" to={`/racks/view/${r.id}`}>View</Link>
                      {edit && <button className="btn sm" onClick={() => setForm(r)}>Edit</button>}
                      {edit && <button className="btn sm" onClick={() => askDelete(r)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {racks.length > 0 && (
        <>
          <h2 className="racks-h2">Rack assignments</h2>
          {racks.map((r) => (
            <details key={r.id} className="card racks-details" open={racks.length === 1}
              onToggle={(e) => { const o = e.currentTarget.open; setOpen((p) => (p[r.id] === o ? p : { ...p, [r.id]: o })); }}>
              <summary>
                <span className="strong">{r.name}</span>
                {r.location && <span className="muted"> ({r.location})</span>}
                <span className="muted"> [{r.rackUnits ?? `Default ${q.data!.defaultUnits}`}U]</span>
                <span className="muted small"> · {r.deviceCount} device{r.deviceCount === 1 ? '' : 's'}</span>
              </summary>
              {r.description && <p className="muted small racks-pad">{r.description}</p>}
              {(open[r.id] ?? racks.length === 1) && <Assignments rack={r} />}
            </details>
          ))}
        </>
      )}

      {form && <RackFormModal rack={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete rack?"
          message={`Are you sure you want to delete '${deleting.name}'?`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await del.mutateAsync(deleting); }}
        />
      )}
    </>
  );
}
