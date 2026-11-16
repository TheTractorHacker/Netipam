import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alertsApi, type DiscoveryAlert, type AddDiscoveryBody } from './api';
import { PageHeader } from '../../components/ui';
import { ConfirmDialog, Field, Modal, TextInput, useToast } from '../../components/kit';
import { useCan } from '../../auth';
import { AlertTabs, QueryState, ViewToggle } from './AlertsCommon';
import { absTime, relTime } from './format';

function ReviewDialog({ alert, onClose, onSave, saving }: {
  alert: DiscoveryAlert; onClose: () => void; saving: boolean; onSave: (b: AddDiscoveryBody) => void;
}) {
  const [f, setF] = useState<AddDiscoveryBody>({
    name: alert.name ?? alert.mac, hostname: alert.hostname ?? '',
    upstreamDeviceName: alert.upstreamDeviceName ?? '', upstreamConnection: alert.upstreamConnection ?? '',
  });
  const set = (k: keyof AddDiscoveryBody) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Add discovered device" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving} onClick={() => onSave(f)}>{saving ? 'Adding…' : 'Add'}</button>
      </>
    }>
      <form className="alerts-form" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Name"><TextInput value={f.name} onChange={set('name')} /></Field>
        <Field label="Hostname"><TextInput value={f.hostname} onChange={set('hostname')} /></Field>
        <Field label="MAC address"><TextInput value={alert.mac} disabled /></Field>
        <Field label="IP address"><TextInput value={alert.ip ?? ''} disabled /></Field>
        <Field label="Upstream device"><TextInput value={f.upstreamDeviceName} onChange={set('upstreamDeviceName')} /></Field>
        <Field label="Upstream connection"><TextInput value={f.upstreamConnection} onChange={set('upstreamConnection')} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function DiscoveryAlerts() {
  const [acked, setAcked] = useState(false);
  const [editing, setEditing] = useState<DiscoveryAlert | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [ignoring, setIgnoring] = useState<DiscoveryAlert | null>(null);
  const { edit } = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['alerts', 'discovery', acked], queryFn: () => alertsApi.discovery(acked), refetchInterval: 30_000 });
  const done = () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['summary'] }); qc.invalidateQueries({ queryKey: ['devices'] }); };
  const fail = (e: Error) => toast(e.message, 'bad');

  const add = useMutation({
    mutationFn: (v: { id: number; body?: AddDiscoveryBody }) => alertsApi.addDiscovery(v.id, v.body),
    onSuccess: (r) => { done(); setEditing(null); toast(r.created ? 'Added to inventory' : 'Already in inventory — alert acknowledged'); },
    onError: fail,
  });
  const ignore = useMutation({
    mutationFn: (id: number) => alertsApi.ignoreDiscovery(id),
    onSuccess: () => { done(); toast('MAC ignored — it will not alert again'); },
    onError: fail,
  });
  const ackAll = useMutation({
    mutationFn: alertsApi.ackAllDiscovery,
    onSuccess: (r) => { done(); toast(`Acknowledged ${r.count} alert${r.count === 1 ? '' : 's'}`); },
    onError: fail,
  });
  const busy = add.isPending || ignore.isPending || ackAll.isPending;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="New clients and devices"
        sub={data ? `${rows.length} ${acked ? 'acknowledged' : 'waiting for review'}` : undefined}
        actions={
          <>
            {edit && !acked && rows.length > 1 && <button className="btn" disabled={busy} onClick={() => setConfirmAll(true)}>Dismiss all</button>}
            <button className="btn ghost" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
          </>
        }
      />
      <div className="alerts-tabs-row">
        <AlertTabs active="discovery" />
        <ViewToggle value={acked} onChange={setAcked} />
      </div>

      <QueryState isLoading={isLoading} error={error} empty={rows.length === 0}
        emptyText={acked ? 'No acknowledged discovery alerts.' : 'No unacknowledged discovery alerts.'}>
        <div className="card flush">
          <table className="table">
            <thead>
              <tr><th>Client</th><th>IP</th><th>Conn</th><th className="alerts-hide-sm">Upstream</th><th>Detected</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="strong">{a.name || '—'}</div>
                    <div className="muted small">{a.hostname || '—'}</div>
                    <div className="muted small mono">{a.mac}</div>
                  </td>
                  <td className="mono">{a.ip || '—'}</td>
                  <td>{a.connectionType || '—'}</td>
                  <td className="alerts-hide-sm">{a.upstreamDeviceName || '—'}{a.upstreamConnection && <div className="muted small">{a.upstreamConnection}</div>}</td>
                  <td className="alerts-time">{absTime(a.detectedAtUtc)}<span className="muted small">{relTime(a.detectedAtUtc)}</span></td>
                  <td>
                    {edit && !acked && (
                      <div className="alerts-actions">
                        <button className="btn primary sm" disabled={busy} onClick={() => add.mutate({ id: a.id })}>Add</button>
                        <button className="btn sm" disabled={busy} onClick={() => setEditing(a)}>Edit &amp; add</button>
                        <button className="btn sm" disabled={busy} style={{ color: 'var(--bad)' }} onClick={() => setIgnoring(a)}>Ignore</button>
                      </div>
                    )}
                    {acked && <span className="muted small">acked {relTime(a.acknowledgedAtUtc)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>

      {editing && (
        <ReviewDialog alert={editing} saving={add.isPending} onClose={() => setEditing(null)}
          onSave={(body) => add.mutate({ id: editing.id, body })} />
      )}
      {confirmAll && (
        <ConfirmDialog title="Dismiss all?" confirmLabel="Dismiss all" danger
          message="Acknowledge every pending discovery alert without adding or ignoring them? This includes any that arrived since this page loaded."
          onClose={() => setConfirmAll(false)}
          onConfirm={async () => { await ackAll.mutateAsync(); setConfirmAll(false); }} />
      )}
      {ignoring && (
        <ConfirmDialog title="Ignore this MAC?" confirmLabel="Ignore" danger
          message={`Never alert about ${ignoring.mac} again? It will also be acknowledged.`}
          onClose={() => setIgnoring(null)}
          onConfirm={async () => { await ignore.mutateAsync(ignoring.id); setIgnoring(null); }} />
      )}
    </>
  );
}
