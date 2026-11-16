import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alertsApi } from './api';
import { PageHeader } from '../../components/ui';
import { useToast } from '../../components/kit';
import { useCan } from '../../auth';
import { AlertTabs, QueryState, ViewToggle } from './AlertsCommon';
import { absTime, relTime } from './format';

export default function FirmwareAlerts() {
  const [acked, setAcked] = useState(false);
  const { edit } = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['alerts', 'firmware', acked], queryFn: () => alertsApi.firmware(acked), refetchInterval: 60_000 });
  const done = () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['summary'] }); };
  const ack = useMutation({ mutationFn: (id: number) => alertsApi.ackFirmware(id), onSuccess: () => { done(); toast('Alert acknowledged'); }, onError: (e: Error) => toast(e.message, 'bad') });
  const ackAll = useMutation({ mutationFn: alertsApi.ackAllFirmware, onSuccess: (r) => { done(); toast(`Acknowledged ${r.count} alert${r.count === 1 ? '' : 's'}`); }, onError: (e: Error) => toast(e.message, 'bad') });
  const rows = data ?? [];
  const busy = ack.isPending || ackAll.isPending;

  return (
    <>
      <PageHeader
        title="Firmware updates"
        sub={data ? `${rows.length} ${acked ? 'acknowledged' : 'unacknowledged'}` : undefined}
        actions={
          <>
            {edit && !acked && rows.length > 1 && <button className="btn" disabled={busy} onClick={() => ackAll.mutate()}>Acknowledge all</button>}
            <button className="btn ghost" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</button>
          </>
        }
      />
      <div className="alerts-tabs-row">
        <AlertTabs active="firmware" />
        <ViewToggle value={acked} onChange={setAcked} />
      </div>
      <QueryState isLoading={isLoading} error={error} empty={rows.length === 0} emptyText={acked ? 'No acknowledged alerts.' : 'No firmware updates pending.'}>
        <div className="card flush">
          <table className="table">
            <thead><tr><th>Device</th><th>IP</th><th>Version</th><th>Detected</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="strong">{a.deviceName || '—'}</div>
                    <div className="muted small">{a.model || '—'}</div>
                  </td>
                  <td className="mono">{a.ip || '—'}</td>
                  <td className="alerts-ver">{a.currentVersion || '?'} → {a.targetVersion || '?'}</td>
                  <td className="alerts-time">{absTime(a.detectedAtUtc)}<span className="muted small">{relTime(a.detectedAtUtc)}</span></td>
                  <td>
                    {edit && !acked && <div className="alerts-actions"><button className="btn primary sm" disabled={busy} onClick={() => ack.mutate(a.id)}>Acknowledge</button></div>}
                    {acked && <span className="muted small">acked {relTime(a.acknowledgedAtUtc)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </>
  );
}
