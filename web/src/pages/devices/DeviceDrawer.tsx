import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, ErrorNote, Spinner } from '../../components/kit';
import { devicesApi, type DeviceRow } from './api';
import { Icon, StatusDot, absRel, statusTitle } from './util';

function Item({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (<><dt>{label}</dt><dd>{children}</dd></>);
}

const MODE: Record<string, string> = {
  Normal: 'Normal (UniFi + ping)', PingOnly: 'Ping only', PortOnly: 'TCP port only',
  PingAndPort: 'Ping + TCP port', HttpOnly: 'HTTP only', PingAndHttp: 'Ping + HTTP',
};

export default function DeviceDrawer({ id, canEdit, withLastSeen, onClose, onEdit, onDelete }: {
  id: number; canEdit: boolean; withLastSeen: boolean;
  onClose: () => void; onEdit: (d: DeviceRow) => void; onDelete: (d: DeviceRow) => void;
}) {
  const q = useQuery({ queryKey: ['devices', 'detail', id], queryFn: () => devicesApi.get(id) });
  const ref = useRef<HTMLElement>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'));
      if (f.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const first = f[0], last = f[f.length - 1], act = document.activeElement;
      if (e.shiftKey && (act === first || act === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
      else if (!ref.current.contains(act)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);

  const d = q.data;
  const state = d ? (!d.isStatusTracked ? 'Not tracked' : d.isOnline ? 'Online' : 'Offline') : '';

  return (
    <div className="dev-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} tabIndex={-1} className="dev-drawer" role="dialog" aria-modal="true" aria-label={d ? `${d.name} details` : 'Device details'}>
        <div className="dev-drawer-head">
          <div className="dev-drawer-title">
            {d && <StatusDot d={d} withLastSeen={withLastSeen} />}
            <h2>{d?.name ?? 'Loading…'}</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close details">✕</button>
        </div>

        <div className="dev-drawer-body">
          {q.isLoading && <Spinner />}
          {q.error && <ErrorNote error={q.error} />}
          {d && (
            <>
              <div className="row dev-drawer-badges">
                <Badge tone={!d.isStatusTracked ? 'neutral' : d.isOnline ? 'ok' : 'bad'}>{state}</Badge>
                {d.type && <Badge tone="info">{d.type}</Badge>}
                {d.isCritical && <Badge tone="warn">Critical</Badge>}
                {d.ignoreOffline && <Badge>Ignored offline</Badge>}
                {d.isProxmoxHost && <Badge>Proxmox host</Badge>}
                {d.isTopologyRoot && <Badge>Topology root</Badge>}
              </div>

              <div className="row dev-drawer-actions">
                {d.accessHref && <a className="btn sm" href={d.accessHref} target="_blank" rel="noopener noreferrer">Open {Icon.external()}</a>}
                <Link className="btn sm" to={`/devices/${d.id}/history`}>{Icon.history()} History</Link>
                {canEdit && <button className="btn sm" onClick={() => onEdit(d)}>{Icon.edit()} Edit</button>}
                {canEdit && <button className="btn sm danger" onClick={() => onDelete(d)}>{Icon.trash()} Delete</button>}
              </div>

              <h3 className="dev-h3">Network</h3>
              <dl className="dev-dl">
                <Item label="IP address">{d.ipDisplay
                  ? <span className="mono" title={d.ipTooltip ?? undefined}>{d.ipDisplay}</span>
                  : d.ipAddress && <span className="mono">{d.ipAddress}</span>}</Item>
                <Item label="MAC"><span className="mono">{d.macAddress}</span></Item>
                <Item label="Hostname">{d.hostname}</Item>
                <Item label="Subnet">{d.subnet && <a href={`/subnets/${d.subnetId}/ips`}>{d.subnet}</a>}</Item>
                <Item label="Connection">{d.connectionTooltip}</Item>
                <Item label="Upstream">{d.upstream}</Item>
                <Item label="Host">{d.hostName}</Item>
                <Item label="Manual upstream">{d.manualUpstreamName}</Item>
              </dl>

              <h3 className="dev-h3">Status and monitoring</h3>
              <dl className="dev-dl">
                <Item label="Status">{statusTitle(d, false)}</Item>
                <Item label="Last online">{d.lastOnlineAt && absRel(d.lastOnlineAt)}</Item>
                <Item label="Last seen">{d.lastSeenAt && absRel(d.lastSeenAt)}</Item>
                <Item label="Monitor mode">{MODE[d.monitorMode] ?? d.monitorMode}</Item>
                <Item label="Monitor check">{d.ipTooltip && d.ipDisplay ? d.ipTooltip : null}</Item>
              </dl>

              <h3 className="dev-h3">Placement</h3>
              <dl className="dev-dl">
                <Item label="Location">{d.location}</Item>
                <Item label="Rack">{d.rack}</Item>
                <Item label="Asset #">{d.assetNumber}</Item>
              </dl>

              <h3 className="dev-h3">Hardware and source</h3>
              <dl className="dev-dl">
                <Item label="Manufacturer">{d.manufacturer}</Item>
                <Item label="Model">{d.model}</Item>
                <Item label="OS">{d.operatingSystem}</Item>
                <Item label="Source">{d.source}</Item>
                <Item label="Used / New">{d.usedNew}</Item>
                <Item label="Source date">{d.sourceDateText}</Item>
              </dl>

              {(d.isProxmoxHost || d.accessCategory || d.accessLink) && (
                <>
                  <h3 className="dev-h3">Access and Proxmox</h3>
                  <dl className="dev-dl">
                    <Item label="Access link">{d.accessHref && <a href={d.accessHref} target="_blank" rel="noopener noreferrer">{d.accessLink}</a>}</Item>
                    <Item label="Access category">{d.accessCategory}</Item>
                    <Item label="Proxmox instance">{d.proxmoxInstance}</Item>
                    <Item label="Proxmox node">{d.proxmoxNodeIdentifier}</Item>
                  </dl>
                </>
              )}

              {d.description && (
                <>
                  <h3 className="dev-h3">Notes</h3>
                  <p className="dev-notes">{d.description}</p>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
