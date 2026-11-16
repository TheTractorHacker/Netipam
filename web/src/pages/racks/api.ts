import { http } from '../../http';

export interface RackRow {
  id: number; name: string; description: string | null; locationId: number | null; location: string | null;
  rackUnits: number | null; totalUnits: number; deviceCount: number; usedUnits: number; freeUnits: number; unplacedCount: number;
}
export interface RackList { defaultUnits: number; racks: RackRow[] }

export interface RackDevice {
  id: number; name: string; ipAddress: string | null; manufacturer: string | null; model: string | null;
  type: string | null; isDevice: boolean; uPosition: number | null; uSize: number | null; placed: boolean;
  overlap: boolean; link: string | null; isOnline: boolean; isStatusTracked: boolean;
}
export interface RackDetail {
  rack: { id: number; name: string; description: string | null; locationId: number | null; location: string | null; rackUnits: number | null };
  devices: RackDevice[]; totalUnits: number; defaultUnits: number;
}
export interface RackOptions {
  locations: { id: number; name: string }[];
  unassignedDevices: { id: number; name: string; ipAddress: string | null; type: string | null; isDevice: boolean }[];
}
export interface RackInput { name: string; description: string | null; locationId: number | null; rackUnits: number | null }

export const racksApi = {
  list: () => http.get<RackList>('/racks'),
  options: () => http.get<RackOptions>('/racks/options'),
  detail: (id: number) => http.get<RackDetail>(`/racks/${id}`),
  create: (b: RackInput) => http.post<{ id: number }>('/racks', b),
  update: (id: number, b: RackInput) => http.put<{ id: number }>(`/racks/${id}`, b),
  remove: (id: number) => http.del<{ ok: boolean }>(`/racks/${id}`),
  place: (id: number, deviceId: number, uPosition: number | null, uSize: number | null) =>
    http.put<{ ok: boolean }>(`/racks/${id}/devices/${deviceId}`, { uPosition, uSize }),
  unassign: (id: number, deviceId: number) => http.del<{ ok: boolean }>(`/racks/${id}/devices/${deviceId}`),
};

export function statusOf(d: { isStatusTracked: boolean; isOnline: boolean }) {
  return d.isStatusTracked ? (d.isOnline ? 'Online' : 'Offline') : 'Not tracked';
}
export function statusTone(d: { isStatusTracked: boolean; isOnline: boolean }) {
  return d.isStatusTracked ? (d.isOnline ? 'ok' : 'bad') : 'off';
}
