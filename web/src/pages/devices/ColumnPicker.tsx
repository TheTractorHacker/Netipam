import { useState } from 'react';
import { Modal } from '../../components/kit';

export interface ColumnOption { key: string; label: string }

export default function ColumnPicker({ columns, visible, saving, onSave, onClose }: {
  columns: ColumnOption[]; visible: Record<string, boolean>; saving: boolean;
  onSave: (v: Record<string, boolean>) => void; onClose: () => void;
}) {
  const [v, setV] = useState<Record<string, boolean>>(() => Object.fromEntries(columns.map((c) => [c.key, visible[c.key] !== false])));
  const all = (on: boolean) => setV(Object.fromEntries(columns.map((c) => [c.key, on])));
  return (
    <Modal
      title="Choose columns"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={() => onSave(v)}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="row dev-colpick-tools">
        <button className="btn sm" onClick={() => all(true)}>Show all</button>
        <button className="btn sm" onClick={() => all(false)}>Hide all</button>
      </div>
      <div className="dev-colpick">
        {columns.map((c) => (
          <label key={c.key} className="check">
            <input type="checkbox" checked={v[c.key]} onChange={(e) => setV((p) => ({ ...p, [c.key]: e.target.checked }))} />
            {c.label}
          </label>
        ))}
      </div>
      <p className="muted small">Applies to the table view and is saved to your account.</p>
    </Modal>
  );
}
