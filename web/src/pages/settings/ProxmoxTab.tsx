import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, ConfirmDialog, ErrorNote, Field, Modal, Spinner, Switch, TextInput, useToast } from '../../components/kit';
import { Empty } from '../../components/ui';
import { settingsApi, type ProxmoxProfile, type ProxmoxSave } from './api';
import { NumberField, Result, SecretField, Section, rangeError } from './parts';

const blank = (): ProxmoxSave => ({
  name: '', enabled: true, baseUrl: '', apiTokenId: '', apiTokenSecret: '', clearSecret: false,
  intervalSeconds: 300, updateExistingHostAssignments: true, updateGuestClientType: true,
});

function Editor({ profile, onClose }: { profile: ProxmoxProfile | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<ProxmoxSave>(() => profile ? {
    name: profile.name, enabled: profile.enabled, baseUrl: profile.baseUrl, apiTokenId: profile.apiTokenId,
    apiTokenSecret: '', clearSecret: false, intervalSeconds: profile.intervalSeconds,
    updateExistingHostAssignments: profile.updateExistingHostAssignments, updateGuestClientType: profile.updateGuestClientType,
  } : blank());
  const [touched, setTouched] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const patch = (p: Partial<ProxmoxSave>) => setF((x) => ({ ...x, ...p }));

  const errs = {
    name: f.name.trim() ? null : 'Name is required',
    baseUrl: f.baseUrl.trim() ? null : 'URL is required',
    tokenId: f.apiTokenId.trim() ? null : 'Token ID is required',
    secret: !profile && !f.apiTokenSecret ? 'Token secret is required for new profiles' : null,
    interval: rangeError(f.intervalSeconds, 30, 86400),
  };
  const invalid = Object.values(errs).some(Boolean);
  const show = (k: keyof typeof errs) => (touched ? errs[k] : null);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, apiTokenSecret: f.apiTokenSecret || undefined };
      return profile ? settingsApi.updateProxmox(profile.id, body) : settingsApi.createProxmox(body);
    },
    onSuccess: (r) => {
      toast('Proxmox profile saved');
      if (r.updaterScheduled) toast(`Proxmox mapping updater scheduled to run in ~${r.delaySeconds} seconds.`, 'info');
      qc.invalidateQueries({ queryKey: ['settings', 'proxmox'] });
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const testConn = useMutation({
    mutationFn: () => settingsApi.testProxmox({ id: profile?.id, baseUrl: f.baseUrl, apiTokenId: f.apiTokenId, apiTokenSecret: f.apiTokenSecret || undefined }),
    onSuccess: (r) => setTest(r),
    onError: (e: Error) => setTest({ ok: false, message: e.message }),
  });

  return (
    <Modal
      title={profile ? `Edit ${profile.name}` : 'New Proxmox profile'}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="row" style={{ marginRight: 'auto' }}>
            <button type="button" className="btn" disabled={testConn.isPending} onClick={() => testConn.mutate()}>
              {testConn.isPending ? 'Testing…' : 'Test connection'}
            </button>
            <Result r={test} />
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.isPending} onClick={() => { setTouched(true); if (!invalid) save.mutate(); }}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!invalid) save.mutate(); }}>
        <div className="form-grid">
          <Field label="Profile name" error={show('name')}>
            <TextInput value={f.name} placeholder="Proxmox server name" onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <NumberField label="Interval (seconds)" hint="30-86400" value={f.intervalSeconds} min={30} max={86400} step={5}
            onChange={(v) => patch({ intervalSeconds: v })} error={show('interval')} />
          <Field label="Proxmox URL" error={show('baseUrl')}>
            <TextInput value={f.baseUrl} placeholder="https://proxmox.local:8006" onChange={(e) => patch({ baseUrl: e.target.value })} />
          </Field>
          <Field label="API token ID" hint="e.g. root@pam!netipam" error={show('tokenId')}>
            <TextInput value={f.apiTokenId} placeholder="user@pve!tokenId" autoComplete="off" onChange={(e) => patch({ apiTokenId: e.target.value })} />
          </Field>
          <div className="span-all">
            <SecretField label="API token secret" hasSecret={!!profile?.hasToken} value={f.apiTokenSecret ?? ''} clearPending={!!f.clearSecret}
              onChange={(v) => patch({ apiTokenSecret: v, clearSecret: false })}
              onClear={() => f.apiTokenSecret ? patch({ apiTokenSecret: '' }) : patch({ clearSecret: true })} />
            {show('secret') && <span className="field-error">{show('secret')}</span>}
          </div>
          <div className="span-all settings-switches">
            <Switch label="Enabled" checked={f.enabled} onChange={(v) => patch({ enabled: v })} />
            <Switch label="Update existing host assignments" checked={f.updateExistingHostAssignments} onChange={(v) => patch({ updateExistingHostAssignments: v })} />
            <Switch label="Update guest client type" checked={f.updateGuestClientType} onChange={(v) => patch({ updateGuestClientType: v })} />
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function ProxmoxTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['settings', 'proxmox'], queryFn: settingsApi.proxmox });
  const [editing, setEditing] = useState<ProxmoxProfile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProxmoxProfile | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const run = useMutation({
    mutationFn: settingsApi.runProxmox,
    onSuccess: () => toast('Proxmox updater triggered. It will run shortly.', 'info'),
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  return (
    <Section
      title="Proxmox host profiles"
      sub="Proxmox profiles can be attached to devices to auto-map host and guest relationships."
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setEditing('new')}>New profile</button>
        <button className="btn" disabled={run.isPending || !data?.some((p) => p.enabled)} onClick={() => run.mutate()}>Run updater now</button>
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && data.length === 0 && <Empty>No Proxmox profiles yet. Add one to map VMs and containers to their hosts.</Empty>}
      {data && data.length > 0 && (
        <div className="card flush" style={{ marginBottom: 0 }}>
          <table className="table">
            <thead><tr><th>Name</th><th>URL</th><th>Token</th><th className="r">Interval</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td>
                  <td className="mono">{p.baseUrl}</td>
                  <td><span className="mono">{p.apiTokenId}</span> {!p.hasToken && <Badge tone="warn">no secret</Badge>}</td>
                  <td className="r num">{p.intervalSeconds}s</td>
                  <td><Badge tone={p.enabled ? 'ok' : 'neutral'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn sm" onClick={() => setEditing(p)}>Edit</button>
                      <button className="btn sm danger" onClick={() => setDeleting(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <Editor profile={editing === 'new' ? null : editing} onClose={closeEditor} />}
      {deleting && (
        <ConfirmDialog
          title="Delete Proxmox profile?"
          message={`Delete profile "${deleting.name}"? Devices marked as Proxmox host will keep their host flag but lose the instance link.`}
          onClose={closeDelete}
          onConfirm={async () => {
            try {
              await settingsApi.deleteProxmox(deleting.id);
              toast('Proxmox profile deleted');
              qc.invalidateQueries({ queryKey: ['settings', 'proxmox'] });
              closeDelete();
            } catch (e) { toast((e as Error).message, 'bad'); }
          }}
        />
      )}
    </Section>
  );
}
