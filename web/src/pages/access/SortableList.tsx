import { useState } from 'react';

export interface SortItem { id: number; label: string }

/** Reorderable list: native HTML5 drag-and-drop plus keyboard-accessible up/down buttons. */
export default function SortableList({ items, onChange, empty }: { items: SortItem[]; onChange: (next: SortItem[]) => void; empty: string }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = items.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  if (items.length === 0) return <div className="muted">{empty}</div>;

  return (
    <ul className="access-sort">
      {items.map((it, i) => (
        <li
          key={it.id}
          className={(drag === i ? 'dragging ' : '') + (over === i && drag !== i ? 'over' : '')}
          draggable
          onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
          onDragOver={(e) => { if (drag !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(i); } }}
          onDragLeave={() => setOver((o) => (o === i ? null : o))}
          onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setOver(null); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
        >
          <span className="access-handle" aria-hidden title="Drag to reorder">⠿</span>
          <span className="label" title={it.label}>{it.label}</span>
          <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${it.label} up`}>↑</button>
          <button type="button" className="btn ghost sm" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${it.label} down`}>↓</button>
        </li>
      ))}
    </ul>
  );
}
