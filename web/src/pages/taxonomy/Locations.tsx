import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taxonomyApi, type LocationRow } from './api';
import { PageHeader, Empty } from '../../components/ui';
import { ConfirmDialog, ErrorNote, Field, Modal, Spinner, TextInput, Textarea, useToast } from '../../components/kit';
import { useCan } from '../../auth';
import './taxonomy.css';

function LocationDialog({ loc, onClose }: { loc: LocationRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(loc?.name ?? '');
  const [description, setDescription] = useState(loc?.description ?? '');
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() };
      return loc ? taxonomyApi.updateLocation(loc.id, body) : taxonomyApi.createLocation(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['location-devices'] });
      toast(loc ? 'Location saved.' : 'Location added.');
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const nameError = touched && !name.trim() ? 'Name is required.' : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim()) save.mutate();
  };

  return (
    <Modal
      title={loc ? 'Edit location' : 'Add location'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button className="btn primary" form="loc-form" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : loc ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <form id="loc-form" className="tax-form" onSubmit={submit} noValidate>
        <Field label="Name" error={nameError}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} disabled={save.isPending} aria-invalid={!!nameError} required />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={save.isPending} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Locations() {
  const { edit } = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ['locations'], queryFn: taxonomyApi.locations });
  const [editing, setEditing] = useState<LocationRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<LocationRow | null>(null);

  const del = useMutation({
    mutationFn: (id: number) => taxonomyApi.deleteLocation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); toast('Location deleted.'); setDeleting(null); },
    onError: (e: Error) => { toast(e.message, 'bad'); setDeleting(null); },
  });

  const askDelete = (l: LocationRow) => {
    if (l.assigned > 0) { toast('Cannot delete: this location is assigned to one or more devices.', 'bad'); return; }
    setDeleting(l);
  };

  return (
    <>
      <PageHeader
        title="Locations"
        sub={data ? `${data.length} location${data.length === 1 ? '' : 's'}` : undefined}
        actions={edit && <button className="btn primary" onClick={() => setEditing('new')}>+ Add location</button>}
      />
      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && data.length === 0 && (
        <Empty>
          No locations yet.{edit && <> <button className="btn link-btn" onClick={() => setEditing('new')}>Add the first one</button>.</>}
        </Empty>
      )}
      {data && data.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="tax-hide-sm">Description</th>
                <th style={{ width: 110 }}>Assigned</th>
                {edit && <th style={{ width: 150 }}><span className="tax-sr">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id}>
                  <td className="strong">{l.name}</td>
                  <td className="tax-desc tax-hide-sm">{l.description}</td>
                  <td className="num">
                    {l.assigned > 0
                      ? <Link className="tax-count" to={`/locations/${l.id}/devices`} aria-label={`${l.assigned} devices at ${l.name}`}>{l.assigned}</Link>
                      : <span className="muted">0</span>}
                  </td>
                  {edit && (
                    <td>
                      <div className="row-actions">
                        <button className="btn sm" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>Edit</button>
                        <button className="btn sm" onClick={() => askDelete(l)} aria-label={`Delete ${l.name}`}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <LocationDialog loc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete location?"
          message={`Are you sure you want to delete “${deleting.name}”?`}
          onConfirm={() => { del.mutate(deleting.id); }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
