import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, Field, TextInput, useToast } from '../../components/kit';
import { settingsApi } from './api';
import { Section } from './parts';

export function BackupTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const ready = !!file && confirm.trim() === 'IMPORT' && password.length > 0;
  const tooBig = !!file && file.size > 200 * 1024 * 1024;

  return (
    <>
      <Section title="Backup" sub="Backups are JSON and designed to work across versions. User accounts and roles are included.">
        <a className="btn" href="/backup/export" download>Download backup</a>
      </Section>

      <Section title="Restore" className="settings-warn"
        sub="Importing replaces existing data, including users and roles, and may require signing in again.">
        <div className="form-grid">
          <div className="span-all">
            <Field label="Backup file (.json)" error={tooBig ? 'Backup file is too large (max 200 MB).' : null}>
              <input className="settings-file" type="file" accept=".json,application/json"
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setStatus(f ? `${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)` : null); }} />
            </Field>
            {status && <span className="muted small">{status}</span>}
          </div>
          <Field label="Type IMPORT to confirm">
            <TextInput value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Field label="Current password">
            <TextInput type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="settings-foot">
          <button className="btn danger" disabled={!ready || tooBig} onClick={() => setOpen(true)}>Import backup (replaces data)</button>
        </div>
      </Section>

      {open && file && (
        <ConfirmDialog
          title="Import backup?" confirmLabel="Import"
          message="This will replace existing data (devices, subnets, alerts, history, logs, users)."
          onClose={close}
          onConfirm={async () => {
            try {
              await settingsApi.restore(file, confirm.trim(), password);
              toast('Backup imported. You may need to sign in again.');
              setFile(null); setConfirm(''); setPassword(''); setStatus('Backup imported successfully.');
              close();
              // Users and sessions were replaced: drop cached state and force a fresh sign-in.
              qc.clear();
              window.location.assign('/app/');
            } catch (e) { toast((e as Error).message, 'bad'); close(); }
          }}
        />
      )}
    </>
  );
}

export function DangerTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ready = confirm.trim() === 'RESET' && password.length > 0;

  return (
    <>
      <Section title="Reset imported data" className="settings-danger"
        sub="Deletes imported data (devices/clients, subnets, alerts, history, updater logs, access panel ordering). Users, settings and configuration such as client types, locations, racks and access categories are kept.">
        <div className="form-grid">
          <Field label="Type RESET to confirm">
            <TextInput value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Field label="Current password">
            <TextInput type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="settings-foot">
          <button className="btn danger" disabled={!ready} onClick={() => setOpen(true)}>Reset imported data</button>
        </div>
      </Section>
      {open && (
        <ConfirmDialog
          title="Reset imported data?" confirmLabel="Reset"
          message="This will permanently delete imported devices/clients, subnets, alerts, history, and updater logs."
          onClose={close}
          onConfirm={async () => {
            try {
              await settingsApi.reset(confirm.trim(), password);
              toast('Imported data has been reset.');
              setConfirm(''); setPassword('');
              qc.invalidateQueries();
            } catch (e) { toast((e as Error).message, 'bad'); }
            close();
          }}
        />
      )}
    </>
  );
}
