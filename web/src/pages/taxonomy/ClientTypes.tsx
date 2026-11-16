import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taxonomyApi, type ClientTypeRow, type IconOption } from './api';
import { PageHeader, Empty } from '../../components/ui';
import { Badge, ConfirmDialog, ErrorNote, Field, Modal, Spinner, Switch, TextInput, Textarea, useToast } from '../../components/kit';
import { useCan } from '../../auth';
import './taxonomy.css';

/** Icon markup comes from the server's fixed allow-list (MudBlazor material icons), same values the classic UI stores. */
function Svg({ markup }: { markup: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function IconBox({ icon }: { icon: string | null }) {
  return <span className="tax-icon">{icon ? <Svg markup={icon} /> : <span aria-hidden>·</span>}</span>;
}

function TypeDialog({ type, onClose }: { type: ClientTypeRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const icons = useQuery({ queryKey: ['client-type-icons'], queryFn: taxonomyApi.icons, staleTime: Infinity });
  const [name, setName] = useState(type?.name ?? '');
  const [description, setDescription] = useState(type?.description ?? '');
  const [icon, setIcon] = useState<string | null>(type?.icon ?? null);
  const [isDevice, setIsDevice] = useState(type?.isDevice ?? false);
  const [isHost, setIsHost] = useState(type?.isHost ?? false);
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), icon, isDevice, isHost };
      return type ? taxonomyApi.updateClientType(type.id, body) : taxonomyApi.createClientType(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-types'] });
      toast(type ? 'Client type saved.' : 'Client type added.');
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

  // A stored icon that isn't in the list (legacy value) is kept and shown as "Current".
  const options: IconOption[] = icons.data ?? [];
  const legacy = icon && !options.some((o) => o.svg === icon);
  const busy = save.isPending;

  return (
    <Modal
      title={type ? 'Edit client type' : 'Add client type'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" form="ct-form" type="submit" disabled={busy}>{busy ? 'Saving…' : type ? 'Save' : 'Add'}</button>
        </>
      }
    >
      <form id="ct-form" className="tax-form" onSubmit={submit} noValidate>
        <Field label="Name" error={nameError}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} disabled={busy} aria-invalid={!!nameError} required />
        </Field>

        <div className="field">
          <span className="field-label" id="ct-icon-label">Icon (optional)</span>
          {icons.isLoading && <Spinner />}
          {icons.error && <ErrorNote error={icons.error} />}
          <div className="tax-icons" role="group" aria-labelledby="ct-icon-label">
            <button type="button" aria-pressed={icon === null} onClick={() => setIcon(null)} disabled={busy}>
              <span aria-hidden>∅</span>None
            </button>
            {legacy && (
              <button type="button" aria-pressed onClick={() => undefined}><Svg markup={icon!} />Current</button>
            )}
            {options.map((o) => (
              <button key={o.label} type="button" aria-pressed={icon === o.svg} onClick={() => setIcon(o.svg)} disabled={busy}>
                <Svg markup={o.svg} />{o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tax-switches">
          <Switch checked={isDevice} onChange={setIsDevice} label="Is Device?" />
          <span className="tax-sw-hint">Shows on the Devices page (otherwise it is listed under Clients).</span>
          <Switch checked={isHost} onChange={setIsHost} label="Is Host?" />
          <span className="tax-sw-hint">Devices of this type can be selected as a host device.</span>
        </div>

        <Field label="Description">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        </Field>
      </form>
    </Modal>
  );
}

export default function ClientTypes() {
  const { edit } = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ['client-types'], queryFn: taxonomyApi.clientTypes });
  const [editing, setEditing] = useState<ClientTypeRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ClientTypeRow | null>(null);

  const del = useMutation({
    mutationFn: (id: number) => taxonomyApi.deleteClientType(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-types'] }); toast('Client type deleted.'); setDeleting(null); },
    onError: (e: Error) => { toast(e.message, 'bad'); setDeleting(null); },
  });

  const askDelete = (t: ClientTypeRow) => {
    if (t.assigned > 0) { toast('Cannot delete: this type is assigned to one or more clients.', 'bad'); return; }
    setDeleting(t);
  };

  return (
    <>
      <PageHeader
        title="Client types"
        sub={data ? `${data.length} type${data.length === 1 ? '' : 's'}` : undefined}
        actions={edit && <button className="btn primary" onClick={() => setEditing('new')}>+ Add client type</button>}
      />
      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && data.length === 0 && (
        <Empty>
          No client types yet.{edit && <> <button className="btn link-btn" onClick={() => setEditing('new')}>Add the first one</button>.</>}
        </Empty>
      )}
      {data && data.length > 0 && (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Is device?</th><th>Is host?</th>
                <th className="tax-hide-sm">Description</th>
                <th style={{ width: 90 }}>In use</th>
                {edit && <th style={{ width: 150 }}><span className="tax-sr">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td><div className="tax-name"><IconBox icon={t.icon} /><span className="strong">{t.name}</span></div></td>
                  <td>{t.isDevice ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</td>
                  <td>{t.isHost ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</td>
                  <td className="tax-desc tax-hide-sm">{t.description}</td>
                  <td className="num">{t.assigned > 0 ? t.assigned : <span className="muted">0</span>}</td>
                  {edit && (
                    <td>
                      <div className="row-actions">
                        <button className="btn sm" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</button>
                        <button className="btn sm" onClick={() => askDelete(t)} aria-label={`Delete ${t.name}`}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <TypeDialog type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete client type?"
          message={`Are you sure you want to delete “${deleting.name}”?`}
          onConfirm={() => { del.mutate(deleting.id); }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
