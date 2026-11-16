import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, ConfirmDialog, ErrorNote, Spinner, useToast } from '../../components/kit';
import { Empty, PageHeader } from '../../components/ui';
import { useCan } from '../../auth';
import { usersApi, type UserRow } from './api';
import { AddUserDialog, EditRolesDialog, ResetPasswordDialog } from './Dialogs';
import './users.css';

type Dlg = { kind: 'add' } | { kind: 'roles' | 'reset' | 'delete'; user: UserRow } | null;
const tone = (r: string) => (r === 'Admin' ? 'warn' : r === 'Editor' ? 'info' : 'neutral');

export default function Users() {
  const { admin } = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: admin });
  const [dlg, setDlg] = useState<Dlg>(null);
  const close = useCallback(() => setDlg(null), []);

  const del = useMutation({
    mutationFn: (u: UserRow) => usersApi.remove(u.id),
    onSuccess: (_r, u) => { toast(`Deleted '${u.username}'.`); qc.invalidateQueries({ queryKey: ['users'] }); close(); },
    onError: (e: Error) => { toast(e.message, 'bad'); close(); },
  });

  if (!admin) return <div className="error" role="alert">Administrator access is required to manage users.</div>;

  const users = q.data?.users ?? [];
  const allRoles = q.data?.allRoles ?? [];

  const actions = (u: UserRow) => (
    <div className="row-actions">
      <button className="btn sm" onClick={() => setDlg({ kind: 'roles', user: u })}>Roles</button>
      <button className="btn sm" onClick={() => setDlg({ kind: 'reset', user: u })}>Reset password</button>
      <button className="btn sm danger" disabled={u.isSelf} title={u.isSelf ? 'You cannot delete your own account' : undefined}
        onClick={() => setDlg({ kind: 'delete', user: u })}>Delete</button>
    </div>
  );
  const roles = (u: UserRow) => (
    <div className="users-roles">
      {u.roles.length ? u.roles.map((r) => <Badge key={r} tone={tone(r)}>{r}</Badge>) : <span className="muted">No role</span>}
    </div>
  );
  const name = (u: UserRow) => (
    <div className="users-name">
      <span className="users-avatar" aria-hidden>{u.username.slice(0, 2)}</span>
      <span>{u.username}</span>
      {u.isSelf && <Badge>You</Badge>}
    </div>
  );

  return (
    <>
      <PageHeader title="Users" sub="Accounts and roles. Admins manage everything, Editors change inventory, Viewers are read-only."
        actions={<button className="btn primary" onClick={() => setDlg({ kind: 'add' })} disabled={!q.data}>Add user</button>} />

      {q.isLoading && <Spinner />}
      {q.isError && <ErrorNote error={q.error} />}
      {q.data && users.length === 0 && <Empty>No users found.</Empty>}
      {users.length > 0 && (
        <>
          <div className="card flush users-table">
            <table className="table">
              <thead><tr><th>Username</th><th>Roles</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}><td>{name(u)}</td><td>{roles(u)}</td><td>{actions(u)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="users-cards">
            {users.map((u) => (
              <div key={u.id} className="card users-card">{name(u)}{roles(u)}{actions(u)}</div>
            ))}
          </div>
        </>
      )}

      {dlg?.kind === 'add' && <AddUserDialog allRoles={allRoles} onClose={close} />}
      {dlg?.kind === 'roles' && <EditRolesDialog user={dlg.user} allRoles={allRoles} onClose={close} />}
      {dlg?.kind === 'reset' && <ResetPasswordDialog user={dlg.user} onClose={close} />}
      {dlg?.kind === 'delete' && (
        <ConfirmDialog title="Delete user?" message={`Delete '${dlg.user.username}'? This cannot be undone.`}
          onConfirm={async () => { await del.mutateAsync(dlg.user).catch(() => undefined); }} onClose={close} />
      )}
    </>
  );
}
