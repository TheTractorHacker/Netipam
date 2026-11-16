import { useEffect, useState, type ReactNode } from 'react';
import { Field, TextInput } from '../../components/kit';

/** Local editable copy of server state; resets when the server value changes. */
export function useDraft<T>(server: T) {
  const sig = JSON.stringify(server);
  const [draft, setDraft] = useState<T>(server);
  useEffect(() => { setDraft(JSON.parse(sig) as T); }, [sig]);
  const dirty = JSON.stringify(draft) !== sig;
  const patch = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }));
  return { draft, patch, dirty, reset: () => setDraft(JSON.parse(sig) as T) };
}

export function NumberField({
  label, hint, value, onChange, min, max, step, disabled, error,
}: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; disabled?: boolean; error?: string | null;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <TextInput
        type="number" inputMode="numeric" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
    </Field>
  );
}

export function rangeError(v: number, min: number, max: number, allowZero = false): string | null {
  if (!Number.isFinite(v)) return 'Required';
  if (allowZero && v === 0) return null;
  return v < min || v > max ? `Must be ${allowZero ? '0 or ' : ''}${min}-${max}` : null;
}

/** Secret input: never shows the stored value, only whether one exists. */
export function SecretField({
  label, hasSecret, value, onChange, onClear, clearPending, placeholder,
}: {
  label: string; hasSecret: boolean; value: string; onChange: (v: string) => void;
  onClear: () => void; clearPending: boolean; placeholder?: string;
}) {
  return (
    <Field label={label} hint={clearPending ? 'Saved value will be removed when you save.' : hasSecret ? 'A value is saved. Leave blank to keep it.' : 'Nothing saved yet.'}>
      <span className="settings-secret">
        <TextInput
          type="password" autoComplete="new-password" value={value} placeholder={hasSecret && !clearPending ? '••••••••' : placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn sm" disabled={(!hasSecret || clearPending) && !value} onClick={onClear}>
          {value ? 'Discard' : 'Clear saved'}
        </button>
      </span>
    </Field>
  );
}

export function Section({ title, sub, children, className = '' }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card settings-card ${className}`}>
      <h2>{title}</h2>
      {sub && <p className="muted">{sub}</p>}
      {children}
    </section>
  );
}

export function Result({ r }: { r: { ok: boolean; message: string } | null }) {
  if (!r) return null;
  return <span className={'settings-result ' + (r.ok ? 'ok' : 'bad')} role="status">{r.ok ? 'Success: ' : 'Failed: '}{r.message}</span>;
}
