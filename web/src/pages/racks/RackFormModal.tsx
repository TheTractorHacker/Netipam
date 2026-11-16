import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, Modal, Select, Textarea, TextInput, useToast } from '../../components/kit';
import { racksApi, type RackRow } from './api';

export default function RackFormModal({ rack, onClose }: { rack?: RackRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const opts = useQuery({ queryKey: ['racks', 'options'], queryFn: racksApi.options });
  const [name, setName] = useState(rack?.name ?? '');
  const [description, setDescription] = useState(rack?.description ?? '');
  const [locationId, setLocationId] = useState<string>(rack?.locationId?.toString() ?? '');
  const [units, setUnits] = useState<string>(rack?.rackUnits?.toString() ?? '');
  const [touched, setTouched] = useState(false);

  const unitsNum = units.trim() === '' ? null : Number(units);
  const unitsErr = unitsNum !== null && (!Number.isInteger(unitsNum) || unitsNum < 1 || unitsNum > 60) ? 'Enter a whole number from 1 to 60.' : null;
  const nameErr = !name.trim() ? 'Name is required.' : null;

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null, locationId: locationId ? Number(locationId) : null, rackUnits: unitsNum };
      return rack ? racksApi.update(rack.id, body) : racksApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['racks'] });
      toast(rack ? 'Rack saved.' : 'Rack added.');
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameErr || unitsErr) return;
    save.mutate();
  };

  return (
    <Modal
      title={rack ? 'Edit rack' : 'Add rack'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="rack-form" className="btn primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : rack ? 'Save' : 'Add'}</button>
        </>
      }
    >
      <form id="rack-form" className="racks-form" onSubmit={submit} noValidate>
        <Field label="Name" error={touched ? nameErr : null}>
          <TextInput maxLength={100} value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} required />
        </Field>
        <Field label="Location">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={save.isPending}>
            <option value="">— None —</option>
            {opts.data?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Description">
          <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} disabled={save.isPending} />
        </Field>
        <Field label="Rack size (U)" hint="Leave blank for default size (42U)." error={touched ? unitsErr : null}>
          <TextInput type="number" min={1} max={60} value={units} onChange={(e) => setUnits(e.target.value)} disabled={save.isPending} />
        </Field>
      </form>
    </Modal>
  );
}
