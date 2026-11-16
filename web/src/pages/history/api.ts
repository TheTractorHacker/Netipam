import { http } from '../../http';

export interface Segment { start: number; minutes: number; kind: 'online' | 'offline' | 'unknown' }
export interface DailyRow { date: string; onlineSeconds: number; offlineSeconds: number; observedSeconds: number; percent: number }
export interface StatusEvent { id: number; isOnline: boolean; at: string; source: string | null }
export interface DeviceIp { id: number; ip: string; port: number | null; source: string | null; firstSeen: string; lastSeen: string | null }
export interface DeviceHistory {
  timeZone: string;
  device: { id: number; name: string; clientType: string | null; isDevice: boolean };
  daily: DailyRow[];
  timelines: Record<string, Segment[]>;
  events: StatusEvent[];
  ips: DeviceIp[];
}

export interface ChangeRow { id: number; deviceId: number | null; deviceName: string | null; ip: string | null; field: string; oldValue: string | null; newValue: string | null }
export interface RunRow {
  id: number; startedAt: string; finishedAt: string | null; durationMs: number | null;
  changedCount: number; error: string | null; source: string | null; changes: ChangeRow[];
}
export interface LogsResponse { timeZone: string; retentionHours: number; runs: RunRow[] }

export interface IpRow {
  id: number; deviceId: number; ip: string; port: number | null; source: string | null;
  firstSeen: string; lastSeen: string | null; deviceName: string | null; hostname: string | null;
  mac: string | null; type: string | null; subnetId: number | null; sortKey: number;
}
export interface IpHistoryResponse { timeZone: string; rows: IpRow[]; subnets: { id: number; name: string; cidr: string }[] }

/** Server's IANA zone; times are shown in it so they line up with the server-bucketed day timelines. */
let serverZone: string | null = null;
let zoneFmt: Intl.DateTimeFormat | null = null;
function captureZone<T extends { timeZone?: string }>(r: T): T {
  if (r.timeZone && r.timeZone !== serverZone) {
    try {
      zoneFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: r.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      });
      serverZone = r.timeZone;
    } catch { zoneFmt = null; serverZone = null; }
  }
  return r;
}
export function serverZoneName(): string | null { return serverZone; }

export const historyApi = {
  device: (id: number) => http.get<DeviceHistory>(`/devices/${id}/history`).then(captureZone),
  logs: () => http.get<LogsResponse>('/history/logs').then(captureZone),
  ip: () => http.get<IpHistoryResponse>('/history/ip').then(captureZone),
  about: () => http.get<{ version: string; website: string }>('/about'),
};

/** MM-dd-yyyy HH:mm in the server's zone (matches classic format); browser zone if unknown. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (zoneFmt) {
    const m: Record<string, string> = {};
    for (const part of zoneFmt.formatToParts(d)) m[part.type] = part.value;
    return `${m.month}-${m.day}-${m.year} ${m.hour}:${m.minute}`;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local midnight for a yyyy-MM-dd input value. */
export function localDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** [start, endExclusive) in epoch ms for an inclusive local date range, or null when incomplete. */
export function dayRange(from: string, to: string): [number, number] | null {
  if (!from || !to) return null;
  const s = localDay(from);
  const e = localDay(to);
  e.setDate(e.getDate() + 1);
  return [s.getTime(), e.getTime()];
}

export function contains(v: string | null | undefined, term: string) {
  return !!v && v.toLowerCase().includes(term);
}
