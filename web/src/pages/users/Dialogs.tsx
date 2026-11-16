import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field, Modal, Select, TextInput, useToast } from '../../components/kit';
import { PasswordField, passwordValid } from './PasswordFields';
import { usersApi, type UserRow } from './api';

const ROLE_HELP: Record<string, string> = {
  Admin: 'Everything, including users, secrets and backups',
  Editor: 'Can add and change inventory',
  Viewer: 'Read-only',
};

/** Modal focuses its header close button on mount; move focus to the first field right after. */
function useInitialFocus(selector: string) {
  useEffect(() => {
    const t = setTimeout(() => document.querySelector<HTMLElement>(`.modal-body ${selector}`)?.focus(), 0);
    return () => clearTimeout(t);
  }, [selector]);
}

function useDone(onClose: () => void) {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose(); };
}

export function AddUserDialog({ allRoles, onClose }: { allRoles: string[]; onClose: () => void }) {
  useInitialFocus('input');
  const toast = useToast();
  const done = useDone(onClose);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(allRoles.includes('Viewer') ? 'Viewer' : '');
  const m = useMutation({
    mutationFn: () => usersApi.create({ username: username.trim(), password, role: role || null }),
    onSuccess: () => { toast(`Created '${username.trim()}'.`); done(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const valid = username.trim().length > 0 && passwordValid(password);
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid && !m.isPending) m.mutate(); };
  return (
    <Modal title="Add user" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="users-add" disabled={!valid || m.isPending}>{m.isPending ? 'Creating…' : 'Create'}</button>
      </>}>
      <form id="users-add" className="users-form" onSubmit={submit}>
        <Field label="Username">
          <TextInput value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <PasswordField label="Password" value={password} onChange={setPassword} />
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">No role</option>
            {allRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

export function EditRolesDialog({ user, allRoles, onClose }: { user: UserRow; allRoles: string[]; onClose: () => void }) {
  useInitialFocus('input');
  const toast = useToast();
  const done = useDone(onClose);
  const [sel, setSel] = useState<string[]>(user.roles);
  const m = useMutation({
    mutationFn: () => usersApi.setRoles(user.id, sel),
    onSuccess: () => { toast('Roles updated.'); done(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const toggle = (r: string, on: boolean) => setSel((s) => (on ? [...s, r] : s.filter((x) => x !== r)));
  return (
    <Modal title={`Edit roles — ${user.username}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="users-form" role="group" aria-label="Roles">
        {allRoles.map((r) => (
          <label key={r} className="users-roleopt">
            <input type="checkbox" checked={sel.includes(r)} onChange={(e) => toggle(r, e.target.checked)} />
            <span>{r}{ROLE_HELP[r] && <small>{ROLE_HELP[r]}</small>}</span>
          </label>
        ))}
        {user.isSelf && sel.length > 0 && !sel.includes('Admin') && user.roles.includes('Admin') && (
          <div className="error" role="alert">You are removing your own Admin role. You will lose access to this page.</div>
        )}
      </div>
    </Modal>
  );
}

export function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  useInitialFocus('input');
  const toast = useToast();
  const [pw, setPw] = useState('');
  const m = useMutation({
    mutationFn: () => usersApi.resetPassword(user.id, pw),
    onSuccess: () => { toast('Password reset.'); onClose(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const valid = passwordValid(pw);
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid && !m.isPending) m.mutate(); };
  return (
    <Modal title="Reset password" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="users-reset" disabled={!valid || m.isPending}>{m.isPending ? 'Resetting…' : 'Reset'}</button>
      </>}>
      <form id="users-reset" className="users-form" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>Set a new password for <strong>{user.username}</strong>.</p>
        <PasswordField label="New password" value={pw} onChange={setPw} />
      </form>
    </Modal>
  );
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  useInitialFocus('input');
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const m = useMutation({
    mutationFn: () => usersApi.changeMyPassword(cur, pw),
    onSuccess: () => { toast('Password changed.'); onClose(); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const mismatch = confirm.length > 0 && confirm !== pw;
  const valid = cur.length > 0 && passwordValid(pw) && pw === confirm;
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid && !m.isPending) m.mutate(); };
  return (
    <Modal title="Change my password" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="users-change" disabled={!valid || m.isPending}>{m.isPending ? 'Saving…' : 'Change password'}</button>
      </>}>
      <form id="users-change" className="users-form" onSubmit={submit}>
        <Field label="Current password">
          <TextInput type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <PasswordField label="New password" value={pw} onChange={setPw} />
        <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : null}>
          <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
