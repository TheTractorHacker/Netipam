import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, Modal, Select, Spinner, TextInput, useToast } from '../../components/kit';
import { racksApi, type RackDevice } from './api';

/** Assign a device to a rack at a U position, or edit the placement of an existing one. */
export default function PlacementModal({
  rackId, totalUnits, devices, existing, initialU, onClose,
}: {
  rackId: number; totalUnits: number; devices: RackDevice[]; existing?: RackDevice; initialU?: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const opts = useQuery({ queryKey: ['racks', 'options'], queryFn: racksApi.options, enabled: !existing });
  const [deviceId, setDeviceId] = useState<string>(existing ? String(existing.id) : '');
  const [pos, setPos] = useState<string>((existing?.uPosition ?? initialU)?.toString() ?? '');
  const [size, setSize] = useState<string>(existing?.uSize?.toString() ?? '');
  const [touched, setTouched] = useState(false);

  const posN = pos.trim() === '' ? null : Number(pos);
  // A position with a blank size means a 1U device.
  const sizeN = size.trim() === '' ? (posN === null ? null : 1) : Number(size);
  const bad = (n: number | null) => n === null || !Number.isInteger(n) || n < 1;
  const tooBig = (n: number | null, max: number) => n !== null && n > max;
  const posErr = posN !== null && bad(posN) ? 'Whole number, 1 or more.' : tooBig(posN, 60) ? 'At most 60.' : null;
  const sizeErr = sizeN !== null && bad(sizeN) ? 'Whole number, 1 or more.' : tooBig(sizeN, 10) ? 'At most 10.' : null;
  const pairErr = (posN === null) !== (sizeN === null) ? 'Set both U position and size, or leave both blank.' : null;
  const devErr = !deviceId ? 'Choose a device.' : null;

  // Devices that would share a U with this placement (mirrors the red overlap highlight).
  const conflicts = useMemo(() => {
    if (posN === null || sizeN === null || bad(posN) || bad(sizeN)) return [];
    const end = posN + sizeN - 1;
    return devices.filter((d) => d.placed && d.id !== Number(deviceId) &&
      d.uPosition! <= end && d.uPosition! + d.uSize! - 1 >= posN);
  }, [devices, posN, sizeN, deviceId]);
  const overflow = posN !== null && sizeN !== null && !bad(posN) && !bad(sizeN) && posN + sizeN - 1 > totalUnits;

  const save = useMutation({
    mutationFn: () => racksApi.place(rackId, Number(deviceId), posN, sizeN),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['racks'] });
      toast(existing ? 'Placement saved.' : 'Device assigned to rack.');
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (devErr || posErr || sizeErr || pairErr) return;
    save.mutate();
  };

  return (
    <Modal
      title={existing ? `Edit placement — ${existing.name}` : 'Assign device to rack'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="placement-form" className="btn primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : existing ? 'Save' : 'Assign'}</button>
        </>
      }
    >
      <form id="placement-form" className="racks-form" onSubmit={submit} noValidate>
        {!existing && (
          opts.isLoading ? <Spinner /> : (
            <Field label="Device" error={touched ? devErr : null} hint={opts.data?.unassignedDevices.length === 0 ? 'Every device is already in a rack.' : undefined}>
              <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={save.isPending}>
                <option value="">— Select —</option>
                {opts.data?.unassignedDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.ipAddress ? ` (${d.ipAddress})` : ''}</option>
                ))}
              </Select>
            </Field>
          )
        )}
        <div className="racks-form-pair">
          <Field label="U position (bottom U)" error={touched ? posErr : null}>
            <TextInput type="number" min={1} max={60} value={pos} onChange={(e) => setPos(e.target.value)} disabled={save.isPending} />
          </Field>
          <Field label="Size (U)" error={touched ? sizeErr : null}>
            <TextInput type="number" min={1} max={10} placeholder="1" value={size} onChange={(e) => setSize(e.target.value)} disabled={save.isPending} />
          </Field>
        </div>
        {touched && pairErr && <div className="field-error">{pairErr}</div>}
        <p className="muted small">Size defaults to 1U. Leave both blank to assign without a position; it will be listed as unplaced.</p>
        {conflicts.length > 0 && (
          <div className="racks-warn" role="alert">
            Overlaps with {conflicts.map((c) => c.name).join(', ')}. You can still save; both will be flagged red.
          </div>
        )}
        {overflow && <div className="racks-warn" role="alert">Extends past U{totalUnits}; the rack view will grow to fit.</div>}
      </form>
    </Modal>
  );
}
