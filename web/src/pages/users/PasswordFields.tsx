import { Field, TextInput } from '../../components/kit';

export const MIN_LENGTH = 10;

export function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= MIN_LENGTH, label: `At least ${MIN_LENGTH} characters` },
    { ok: /[A-Z]/.test(pw), label: 'An uppercase letter' },
    { ok: /[a-z]/.test(pw), label: 'A lowercase letter' },
    { ok: /\d/.test(pw), label: 'A digit' },
  ];
}
export const passwordValid = (pw: string) => passwordChecks(pw).every((c) => c.ok);

/** Live checklist of the server's Identity password rules (length 10, upper, lower, digit). */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="users-rules" aria-label="Password requirements">
      {passwordChecks(value).map((c) => <li key={c.label} className={c.ok ? 'met' : ''}>{c.label}</li>)}
    </ul>
  );
}

export function PasswordField({ label, value, onChange, autoComplete = 'new-password', showRules = true, error }:
  { label: string; value: string; onChange: (v: string) => void; autoComplete?: string; showRules?: boolean; error?: string | null }) {
  return (
    <div className="users-form" style={{ gap: 8 }}>
      <Field label={label} error={error}>
        <TextInput type="password" value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      </Field>
      {showRules && <PasswordRules value={value} />}
    </div>
  );
}
