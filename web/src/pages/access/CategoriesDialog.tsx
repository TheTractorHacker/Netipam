import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan } from '../../auth';
import { ConfirmDialog, ErrorNote, Field, Modal, Spinner, TextInput, Textarea, useToast } from '../../components/kit';
import { Empty } from '../../components/ui';
import { accessApi, type Category } from './api';

function CategoryForm({ initial, onClose }: { initial: Category | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [touched, setTouched] = useState(false);
  const save = useMutation({
    mutationFn: () => initial ? accessApi.updateCategory(initial.id, { name, description }) : accessApi.createCategory({ name, description }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access'] }); toast(initial ? 'Category saved' : 'Category added'); onClose(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const err = touched && !name.trim() ? 'Name is required.' : null;
  const submit = () => { setTouched(true); if (name.trim()) save.mutate(); };
  return (
    <Modal
      title={initial ? 'Edit access category' : 'Add access category'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : initial ? 'Save' : 'Add'}</button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="span-all"><Field label="Name" error={err}><TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} required /></Field></div>
        <div className="span-all"><Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={save.isPending} /></Field></div>
      </form>
    </Modal>
  );
}

export default function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const { edit } = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access', 'categories'], queryFn: accessApi.categories });
  const [form, setForm] = useState<Category | 'new' | null>(null);
  const [del, setDel] = useState<Category | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => accessApi.deleteCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access'] }); toast('Access category deleted'); setDel(null); },
    onError: (e: Error) => { toast(e.message, 'bad'); setDel(null); },
  });

  const askDelete = (c: Category) => {
    if (c.deviceCount > 0) { toast('Cannot delete: this category is assigned to one or more devices.', 'bad'); return; }
    setDel(c);
  };

  return (
    <>
      {/* Parent is hidden while a child modal is open so Escape only closes the top one. */}
      {!form && !del && <Modal
        title="Access categories"
        onClose={onClose}
        wide
        footer={
          <>
            {edit && <button className="btn primary" onClick={() => setForm('new')}>Add category</button>}
            <button className="btn" onClick={onClose}>Close</button>
          </>
        }
      >
        {q.isLoading ? <Spinner /> : q.error ? <ErrorNote error={q.error} /> : !q.data?.length ? <Empty>No access categories yet.</Empty> : (
          <div className="card flush" style={{ marginBottom: 0 }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Description</th><th>Devices</th>{edit && <th />}</tr></thead>
              <tbody>
                {q.data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="muted">{c.description}</td>
                    <td className="num">{c.deviceCount}</td>
                    {edit && (
                      <td>
                        <div className="row-actions">
                          <button className="btn sm" onClick={() => setForm(c)} aria-label={`Edit ${c.name}`}>Edit</button>
                          <button className="btn sm danger" onClick={() => askDelete(c)} aria-label={`Delete ${c.name}`}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>}
      {form && <CategoryForm initial={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {del && (
        <ConfirmDialog
          title="Delete access category?"
          message={`Are you sure you want to delete "${del.name}"?`}
          onConfirm={async () => { await remove.mutateAsync(del.id).catch(() => undefined); }}
          onClose={() => setDel(null)}
        />
      )}
    </>
  );
}
