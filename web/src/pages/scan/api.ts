import { http } from '../../http';

export type ScanProfile = 'discover' | 'quick' | 'common' | 'custom';
export type ScanState = 'running' | 'done' | 'cancelled' | 'failed';
export type ScanFlag = 'unknown' | 'matches' | 'offline-but-responding' | 'silent-known';

export interface ScanSummary {
  id: string; subnetId: number; subnetName: string; cidr: string; profile: ScanProfile; state: ScanState;
  startedUtc: string; finishedUtc: string | null; total: number; scanned: number; aliveCount: number;
}
export interface ScanHost {
  ip: string; alive: boolean; rttMs: number | null; hostname: string | null; mac: string | null;
  openPorts: { port: number; service: string | null }[];
  known: boolean; deviceId: number | null; deviceName: string | null; deviceOnline: boolean | null; flag: ScanFlag;
}
export interface ScanJob extends ScanSummary { ports: number[]; error: string | null; hosts: ScanHost[] }

export const scanApi = {
  list: () => http.get<{ items: ScanSummary[] }>('/scans'),
  get: (id: string) => http.get<ScanJob>(`/scans/${encodeURIComponent(id)}`),
  start: (b: { subnetId: number; profile: ScanProfile; ports?: string; block?: string }) => http.post<{ id: string }>('/scans', b),
  cancel: (id: string) => http.post<{ ok: boolean }>(`/scans/${encodeURIComponent(id)}/cancel`),
};
