import { useCallback, useState } from 'react';
import { useMe } from '../../auth';
import { PageHeader } from '../../components/ui';
import { ChangePasswordDialog } from './Dialogs';
import './users.css';

/** Minimal account page; the password dialog is also exported for reuse from any other /account UI. */
export default function Account() {
  const me = useMe().data;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <PageHeader title="My account" sub="Signed-in user details and password." />
      <div className="card users-account">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{me?.name}</strong>
            <div className="muted">{me?.roles.join(', ') || 'No role'}</div>
          </div>
          <button className="btn" onClick={() => setOpen(true)}>Change password</button>
        </div>
      </div>
      {open && <ChangePasswordDialog onClose={close} />}
    </>
  );
}
