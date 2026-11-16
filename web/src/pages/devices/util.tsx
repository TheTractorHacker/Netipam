import type { ReactNode } from 'react';
import type { DeviceRow } from './api';

const svg = (d: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  grid: () => svg(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>),
  table: () => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18" /></>),
  columns: () => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>),
  edit: () => svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>),
  history: () => svg(<><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>),
  trash: () => svg(<><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></>),
  wifi: () => svg(<><path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M2 9a15 15 0 0120 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></>),
  ethernet: () => svg(<><path d="M4 8h16v8H4zM8 8v4M12 8v4M16 8v4M9 16v3M15 16v3" /></>),
  external: () => svg(<><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>, 14),
  plus: () => svg(<path d="M12 5v14M5 12h14" />),
  download: () => svg(<><path d="M12 4v11M7 11l5 5 5-5M4 20h16" /></>),
};

export function ConnIcon({ d }: { d: DeviceRow }) {
  if (!d.connectionType) return null;
  const wifi = d.connectionType.trim().toLowerCase() === 'wifi';
  return (
    <span className={'dev-conn' + (wifi && d.wifiTone ? ` ${d.wifiTone}` : '')} title={d.connectionTooltip ?? d.connectionType}>
      {wifi ? Icon.wifi() : Icon.ethernet()}
      <span className="dev-sr">{d.connectionTooltip ?? d.connectionType}</span>
    </span>
  );
}

function rel(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h ago`;
  if (s < 14 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (7 * 86400))}w ago`;
}

/** "11-16-2026 14:05 (3h ago)" */
export function absRel(iso: string | null | undefined): string {
  if (!iso) return '-';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  const abs = `${p(t.getMonth() + 1)}-${p(t.getDate())}-${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}`;
  return `${abs} (${rel(Date.now() - t.getTime())})`;
}

export function statusTitle(d: DeviceRow, withLastSeen: boolean): string {
  const state = !d.isStatusTracked ? 'Status not tracked' : d.isOnline ? 'Online' : 'Offline';
  if (!withLastSeen) return state;
  return d.isStatusTracked ? `${state} - last online ${absRel(d.lastOnlineAt)}` : state;
}

export function ipSortKey(ip: string | null): number {
  if (!ip) return -1;
  const o = ip.trim().split('.');
  if (o.length !== 4) return -1;
  let v = 0;
  for (const part of o) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return -1;
    v = v * 256 + n;
  }
  return v;
}

export function StatusDot({ d, withLastSeen }: { d: DeviceRow; withLastSeen: boolean }) {
  const cls = !d.isStatusTracked ? 'off' : d.isOnline ? 'on' : 'down';
  const t = statusTitle(d, withLastSeen);
  return <span className={'dot ' + cls} title={t} role="img" aria-label={t} />;
}

export function Dash({ v }: { v: ReactNode }) {
  return v === null || v === undefined || v === '' ? <span className="muted">-</span> : <>{v}</>;
}
