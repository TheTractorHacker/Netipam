import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alertsApi, type OfflineAlert } from './api';
import { PageHeader } from '../../components/ui';
import { Badge, ConfirmDialog, useToast } from '../../components/kit';
import { useCan } from '../../auth';
import { AlertTabs, QueryState, ViewToggle } from './AlertsCommon';
import { absTime, relTime } from './format';

export default function OfflineAlerts() {
  const [acked, setAcked] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [ignoreTarget, setIgnoreTarget] = useState<OfflineAlert | null>(null);
  const { edit } = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['alerts', 'offline', acked];
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: key, queryFn: () => alertsApi.offline(acked), refetchInterval: 30_000 });

  const done = () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['summary'] }); };
  const ack = useMutation({
    mutationFn: (id: number) => alertsApi.ackOffline(id),
    onSuccess: () => { done(); toast('Alert acknowledged'); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const ignore = useMutation({
    mutationFn: (id: number) => alertsApi.ignoreOffline(id),
    onSuccess: () => { done(); toast('Alert acknowledged and device will no longer alert when offline'); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const ackAll = useMutation({
    mutationFn: alertsApi.ackAllOffline,
    onSuccess: (r) => { done(); toast(`Acknowledged ${r.count} alert${r.count === 1 ? '' : 's'}`); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });
  const busy = ack.isPending || ignore.isPending || ackAll.isPending;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Offline alerts"
        sub={data ? `${rows.length} ${acked ? 'acknowledged' : 'unacknowledged'}` : undefined}
        actions={
          <>
            {edit && !acked && rows.length > 1 && <button className="btn" disabled={busy} onClick={() => setConfirmAll(true)}>Acknowledge all</button>}
            <button className="btn ghost" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
          </>
        }
      />
      <div className="alerts-tabs-row">
        <AlertTabs active="offline" />
        <ViewToggle value={acked} onChange={setAcked} />
      </div>

      <QueryState isLoading={isLoading} error={error} empty={rows.length === 0}
        emptyText={acked ? 'No acknowledged alerts.' : 'No unacknowledged alerts. Everything is quiet.'}>
        <div className="card flush">
          <table className="table">
            <thead>
              <tr><th>Client</th><th>IP</th><th>Went offline</th><th>Recovered</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const back = a.cameOnlineAtUtc !== null;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="strong">
                        <span className={'dot ' + (back ? 'on' : 'down')} title={back ? 'Recovered (back online)' : 'Offline (not yet recovered)'} aria-hidden />{' '}
                        {a.deviceName || '—'}
                      </div>
                      <div className="muted small">
                        {a.hostname || '—'}
                        {' '}<Badge tone={back ? 'ok' : 'bad'}>{back ? 'recovered' : 'offline'}</Badge>
                        {a.ignoreOffline && <> <Badge>ignored</Badge></>}
                      </div>
                    </td>
                    <td className="mono">{a.ip || '—'}</td>
                    <td className="alerts-time">{absTime(a.wentOfflineAtUtc)}<span className="muted small">{relTime(a.wentOfflineAtUtc)}</span></td>
                    <td className="alerts-time">{back ? <>{absTime(a.cameOnlineAtUtc)}<span className="muted small">{relTime(a.cameOnlineAtUtc)}</span></> : <span className="muted">—</span>}</td>
                    <td>
                      {edit && !acked && (
                        <div className="alerts-actions">
                          <button className="btn primary sm" disabled={busy} onClick={() => ack.mutate(a.id)}>Acknowledge</button>
                          {a.deviceExists && !a.ignoreOffline && (
                            <button className="btn sm" disabled={busy} onClick={() => setIgnoreTarget(a)}>Ignore offline</button>
                          )}
                        </div>
                      )}
                      {acked && <span className="muted small alerts-time">acked {relTime(a.acknowledgedAtUtc)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </QueryState>
      <p className="muted small">Looking for everything that is down right now? See <Link to="/clients/offline">offline clients</Link>.</p>

      {confirmAll && (
        <ConfirmDialog title="Acknowledge all?" confirmLabel="Acknowledge all" danger={false}
          message={`Acknowledge all ${rows.length} open offline alerts?`}
          onClose={() => setConfirmAll(false)}
          onConfirm={async () => { await ackAll.mutateAsync(); setConfirmAll(false); }} />
      )}
      {ignoreTarget && (
        <ConfirmDialog title="Ignore offline?" confirmLabel="Ignore offline" danger={false}
          message={`Stop alerting when "${ignoreTarget.deviceName ?? 'this device'}" goes offline? This acknowledges the alert and hides the device from offline lists by default.`}
          onClose={() => setIgnoreTarget(null)}
          onConfirm={async () => { await ignore.mutateAsync(ignoreTarget.id); setIgnoreTarget(null); }} />
      )}
    </>
  );
}
