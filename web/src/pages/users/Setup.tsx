import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../auth';
import { Field, Spinner, TextInput } from '../../components/kit';
import { usersApi } from './api';
import { PasswordRules, passwordValid } from './PasswordFields';
import './users.css';

/** First-run page: create the initial Admin, then sign in automatically. Rendered before login. */
export default function Setup() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['setup-status'], queryFn: usersApi.setupStatus });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = username.trim().length > 0 && passwordValid(password) && password === confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await usersApi.setup(username.trim(), password, confirm);
      await authApi.login(username.trim(), password, true);
      await qc.invalidateQueries({ queryKey: ['setup-status'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      window.location.replace('/app/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
      qc.invalidateQueries({ queryKey: ['setup-status'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login users-setup">
        <div className="brand big">
          <span className="brand-mark" aria-hidden>N</span>
          <span>Netipam</span>
        </div>
        {status.isLoading && <Spinner />}
        {status.data && !status.data.needed && (
          <>
            <p className="muted">An admin account already exists. Please sign in.</p>
            <a className="btn primary" href="/app/">Go to sign in</a>
          </>
        )}
        {(status.data?.needed || status.isError) && (
          <form className="users-form" onSubmit={submit}>
            <div>
              <h1 style={{ margin: 0 }}>Welcome</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>First-time setup. Create the initial admin account.</p>
            </div>
            <Field label="Username">
              <TextInput autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <PasswordRules value={password} />
            <Field label="Confirm password" error={mismatch ? 'Passwords do not match.' : null}>
              <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn primary" disabled={!valid || busy}>{busy ? 'Creating…' : 'Create admin'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
