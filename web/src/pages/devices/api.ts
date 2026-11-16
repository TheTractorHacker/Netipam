import { http } from '../../http';

export type Kind = 'device' | 'client';

export interface DeviceRow {
  id: number; name: string; hostname: string | null; ipAddress: string | null; macAddress: string | null;
  accessLink: string | null; accessHref: string | null; accessCategoryId: number | null; accessCategory: string | null;
  clientTypeId: number | null; type: string | null; isDevice: boolean;
  subnetId: number | null; subnet: string | null;
  locationId: number | null; location: string | null;
  rackId: number | null; rackName: string | null; rackUPosition: number | null; rackUSize: number | null; rack: string | null;
  assetNumber: string | null; manufacturer: string | null; model: string | null; operatingSystem: string | null;
  source: string | null; usedNew: string | null; sourceDate: string | null; sourceDateText: string | null;
  description: string | null;
  hostDeviceId: number | null; hostName: string | null;
  isProxmoxHost: boolean; proxmoxInstanceId: number | null; proxmoxInstance: string | null; proxmoxNodeIdentifier: string | null;
  isTopologyRoot: boolean; manualUpstreamDeviceId: number | null; manualUpstreamName: string | null;
  upstream: string | null; connectionType: string | null; connectionDetail: string | null; connectionTooltip: string | null;
  wifiTone: 'warn' | 'ok' | 'info' | null;
  isOnline: boolean; isStatusTracked: boolean; isCritical: boolean; ignoreOffline: boolean;
  monitorMode: string; monitorPort: number | null; monitorUseHttps: boolean; monitorHttpPath: string | null;
  ipDisplay: string | null; ipTooltip: string | null; inDhcp: boolean;
  lastSeenAt: string | null; lastOnlineAt: string | null;
}

export interface Options {
  subnets: { id: number; name: string; cidr: string }[];
  locations: { id: number; name: string }[];
  racks: { id: number; name: string; locationId: number | null; rackUnits: number | null }[];
  clientTypes: { id: number; name: string; isDevice: boolean; isHost: boolean }[];
  accessCategories: { id: number; name: string }[];
  proxmoxInstances: { id: number; name: string }[];
  hosts: { id: number; label: string }[];
  upstreamDevices: { id: number; label: string }[];
  uiAutoRefreshSeconds: number;
  showLastSeenTooltips: boolean;
  monitorModes: string[];
}

/** Body for create/update; mirrors DevicesApi.DeviceInput. */
export interface DeviceInput {
  kind?: Kind;
  name: string; clientTypeId: number | null; hostDeviceId: number | null;
  isProxmoxHost: boolean; proxmoxInstanceId: number | null; proxmoxNodeIdentifier: string | null;
  isTopologyRoot: boolean; isCritical: boolean;
  assetNumber: string | null; hostname: string | null; ipAddress: string | null; macAddress: string | null;
  isStatusTracked: boolean; ignoreOffline: boolean;
  monitorMode: string; monitorPort: number | null; monitorUseHttps: boolean; monitorHttpPath: string | null;
  manualUpstreamDeviceId: number | null; locationId: number | null;
  rackId: number | null; rackUPosition: number | null; rackUSize: number | null;
  manufacturer: string | null; model: string | null; operatingSystem: string | null;
  source: string | null; usedNew: string | null; sourceDate: string | null;
  accessLink: string | null; accessCategoryId: number | null; description: string | null;
}

export type ColumnPage = 'Devices' | 'Clients';
export interface ColumnPrefs { page: ColumnPage; saved: boolean; columns: Record<string, boolean> }

export const devicesApi = {
  list: (kind: Kind | 'all') => http.get<DeviceRow[]>(`/devices?kind=${kind}`),
  get: (id: number) => http.get<DeviceRow>(`/devices/${id}`),
  options: () => http.get<Options>('/devices/options'),
  create: (body: DeviceInput) => http.post<{ id: number }>('/devices', body),
  update: (id: number, body: DeviceInput) => http.put<{ id: number }>(`/devices/${id}`, body),
  remove: (id: number) => http.del<{ ok: boolean; name: string }>(`/devices/${id}`),
  columns: (page: ColumnPage) => http.get<ColumnPrefs>(`/devices/columns?page=${page}`),
  saveColumns: (page: ColumnPage, columns: { key: string; visible: boolean }[]) =>
    http.put<{ ok: boolean }>('/devices/columns', { page, columns }),
};
