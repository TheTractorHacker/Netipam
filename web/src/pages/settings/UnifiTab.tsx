import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Field, Select, Switch, TextInput, useToast } from '../../components/kit';
import { settingsApi, type SettingsBundle, type UnifiSave } from './api';
import { NumberField, Result, SecretField, Section, rangeError, useDraft } from './parts';

type Draft = Omit<UnifiSave, 'password' | 'apiKey' | 'clearPassword' | 'clearApiKey'> & {
  password: string; apiKey: string; clearPassword: boolean; clearApiKey: boolean;
};

const SYNC: { key: keyof Draft; label: string }[] = [
  { key: 'syncOnlineStatus', label: 'Online status' },
  { key: 'syncName', label: 'Name' },
  { key: 'syncHostname', label: 'Hostname' },
  { key: 'syncIpAddress', label: 'IP address' },
  { key: 'updateConnectionFields', label: 'Connection + Upstream' },
  { key: 'syncManufacturer', label: 'Manufacturer' },
  { key: 'syncModel', label: 'Model' },
];

export default function UnifiTab({ data }: { data: SettingsBundle }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPassword, hasApiKey, status: _s, ...rest } = data.unifi; void _s;
  const server: Draft = { ...rest, password: '', apiKey: '', clearPassword: false, clearApiKey: false };
  const { draft, patch, dirty, reset } = useDraft(server);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const status = useQuery({
    queryKey: ['settings', 'unifi-status'], queryFn: settingsApi.unifiStatus,
    initialData: data.unifi.status, refetchInterval: 5000,
  });

  const apiKeyMode = draft.authMode === 'ApiKey';
  const intervalErr = draft.updaterEnabled ? rangeError(draft.updaterIntervalSeconds, 30, 86400) : null;
  const cutoffErr = rangeError(draft.knownClientCutoffDays, 1, 3650, true);
  const invalid = !!intervalErr || !!cutoffErr;

  const save = useMutation({
    mutationFn: () => settingsApi.saveUnifi({
      ...draft,
      password: draft.password || undefined, apiKey: draft.apiKey || undefined,
    }),
    onSuccess: () => { toast('UniFi settings saved'); setTest(null); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const testConn = useMutation({
    mutationFn: settingsApi.testUnifi,
    onSuccess: (r) => { setTest(r); toast(r.ok ? 'UniFi connection test succeeded' : `UniFi test failed: ${r.message}`, r.ok ? 'ok' : 'bad'); },
    onError: (e: Error) => { setTest({ ok: false, message: e.message }); toast(e.message, 'bad'); },
  });
  const run = useMutation({
    mutationFn: settingsApi.runUnifi,
    onSuccess: () => { toast('Updater triggered. It will run shortly.', 'info'); setTimeout(() => status.refetch(), 4000); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const last = status.data.lastRunUtc ? new Date(status.data.lastRunUtc) : null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!invalid) save.mutate(); }}>
      <Section title="UniFi connection" sub={<>Recommended: a dedicated UniFi account with <b>local access</b> and <b>view-only</b> permissions to Network.</>}>
        <div>
          <div className="form-grid">
            <Field label="Access URL" hint="UniFi OS or gateway console URL">
              <TextInput value={draft.baseUrl ?? ''} placeholder="https://192.168.1.1" onChange={(e) => patch({ baseUrl: e.target.value })} />
            </Field>
            <Field label="Auth mode">
              <Select value={draft.authMode} onChange={(e) => patch({ authMode: e.target.value as 'Session' | 'ApiKey' })}>
                <option value="Session">Session (username/password)</option>
                <option value="ApiKey">API key</option>
              </Select>
            </Field>
            <Field label="Site name" hint="Often “default”">
              <TextInput value={draft.siteName ?? ''} placeholder="default" onChange={(e) => patch({ siteName: e.target.value })} />
            </Field>
            {apiKeyMode ? (
              <SecretField label="API key" hasSecret={hasApiKey} value={draft.apiKey} clearPending={draft.clearApiKey}
                onChange={(v) => patch({ apiKey: v, clearApiKey: false })}
                onClear={() => draft.apiKey ? patch({ apiKey: '' }) : patch({ clearApiKey: true })} />
            ) : (
              <>
                <Field label="Username">
                  <TextInput value={draft.username ?? ''} autoComplete="off" onChange={(e) => patch({ username: e.target.value })} />
                </Field>
                <SecretField label="Password" hasSecret={hasPassword} value={draft.password} clearPending={draft.clearPassword}
                  onChange={(v) => patch({ password: v, clearPassword: false })}
                  onClear={() => draft.password ? patch({ password: '' }) : patch({ clearPassword: true })} />
              </>
            )}
          </div>
          <div className="settings-foot">
            <span className="grow row">
              <button type="button" className="btn" disabled={testConn.isPending || dirty} onClick={() => testConn.mutate()}
                title={dirty ? 'Save changes before testing' : undefined}>
                {testConn.isPending ? 'Testing…' : 'Test connection'}
              </button>
              {dirty && <span className="muted small">Save before testing</span>}
              <Result r={test} />
            </span>
            <button type="submit" className="btn primary" disabled={!dirty || invalid || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </Section>

      <Section title="Status updater" sub="Scheduled sync of device state from UniFi.">
        <div>
          <div className="form-grid">
            <div className="span-all">
              <Switch label="Enable updater" checked={draft.updaterEnabled} onChange={(v) => patch({ updaterEnabled: v })} />
              <div className="field-hint">When disabled, scheduled updates pause. “Run now” still works.</div>
            </div>
            <NumberField label="Interval (seconds)" hint="Recommended 60-600, minimum 30" value={draft.updaterIntervalSeconds}
              min={30} max={86400} step={5} disabled={!draft.updaterEnabled} error={intervalErr}
              onChange={(v) => patch({ updaterIntervalSeconds: v })} />
            <NumberField label="Known client cutoff (days)" hint="Import only known/offline clients seen within this many days. 0 disables the cutoff."
              value={draft.knownClientCutoffDays} min={0} max={3650} error={cutoffErr}
              onChange={(v) => patch({ knownClientCutoffDays: v })} />
          </div>

          <h3 className="settings-sub">Sync fields</h3>
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            Choose which fields the updater may change. Enabling these overrides manual entries.
          </p>
          <div className={'settings-switches' + (draft.updaterEnabled ? '' : ' off')}>
            {SYNC.map((s) => (
              <Switch key={s.key} label={s.label} checked={draft[s.key] as boolean}
                onChange={(v) => patch({ [s.key]: v } as Partial<Draft>)} />
            ))}
          </div>

          <div className="settings-foot">
            <span className="grow row muted small">
              <Badge tone={status.data.lastError ? 'bad' : last ? 'ok' : 'neutral'}>{status.data.lastError ? 'Error' : last ? 'OK' : 'Never run'}</Badge>
              <span>
                Last run: {last ? last.toLocaleString() : '—'}
                {status.data.lastError ? ` • ${status.data.lastError}` : last ? ` • Changed: ${status.data.lastChangedCount}` : ''}
              </span>
            </span>
            <button type="button" className="btn" disabled={run.isPending} onClick={() => run.mutate()}>Run updater now</button>
            <button type="button" className="btn" disabled={!dirty || save.isPending} onClick={reset}>Discard</button>
            <button type="submit" className="btn primary" disabled={!dirty || invalid || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </Section>
    </form>
  );
}
