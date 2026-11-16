import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, Field, Modal, Select, Spinner, useToast } from '../../components/kit';
import { accessApi } from './api';
import SortableList, { type SortItem } from './SortableList';

const UNCAT = 'none';

export default function OrderDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access', 'order'], queryFn: accessApi.order, gcTime: 0 });
  const [cats, setCats] = useState<SortItem[]>([]);
  const [lists, setLists] = useState<Record<string, SortItem[]>>({});
  const [sel, setSel] = useState<string>(UNCAT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!q.data || ready) return;
    setCats(q.data.categories.map((c) => ({ id: c.id, label: c.name })));
    const m: Record<string, SortItem[]> = {};
    for (const l of q.data.items) m[l.categoryId === null ? UNCAT : String(l.categoryId)] = l.devices.map((d) => ({ id: d.id, label: d.name }));
    setLists(m);
    setSel(q.data.categories.length ? String(q.data.categories[0].id) : UNCAT);
    setReady(true);
  }, [q.data, ready]);

  const save = useMutation({
    mutationFn: () => accessApi.saveOrder({
      categoryIds: cats.map((c) => c.id),
      items: Object.entries(lists).map(([k, v]) => ({ categoryId: k === UNCAT ? null : Number(k), deviceIds: v.map((d) => d.id) })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['access'] }); toast('Order saved'); onClose(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  return (
    <Modal
      title="Arrange access panel"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNote error={q.error} /> : (
        <>
          <section className="access-order-section">
            <h3>Categories</h3>
            <SortableList items={cats} onChange={setCats} empty="No categories available." />
            <p className="hint">Uncategorized items always stay at the end.</p>
          </section>
          <section className="access-order-section">
            <h3>Tiles</h3>
            <Field label="Category">
              <Select value={sel} onChange={(e) => setSel(e.target.value)}>
                <option value={UNCAT}>Uncategorized</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <div style={{ height: 10 }} />
            <SortableList items={lists[sel] ?? []} onChange={(n) => setLists((l) => ({ ...l, [sel]: n }))} empty="No items in this category." />
          </section>
        </>
      )}
    </Modal>
  );
}
