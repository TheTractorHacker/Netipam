import { http } from '../../http';

export interface OfflineAlert {
  id: number; deviceId: number; deviceName: string | null; hostname: string | null;
  ip: string | null; mac: string | null;
  wentOfflineAtUtc: string; cameOnlineAtUtc: string | null;
  isAcknowledged: boolean; acknowledgedAtUtc: string | null;
  ignoreOffline: boolean; deviceExists: boolean; source: string | null;
}

export interface DiscoveryAlert {
  id: number; deviceName: string; name: string | null; hostname: string | null;
  ip: string | null; mac: string;
  connectionType: string | null; connectionDetail: string | null;
  upstreamDeviceName: string | null; upstreamDeviceMac: string | null; upstreamConnection: string | null;
  isOnline: boolean; detectedAtUtc: string;
  isAcknowledged: boolean; acknowledgedAtUtc: string | null; source: string | null;
}

export interface FirmwareAlert {
  id: number; deviceId: number; deviceName: string | null; ip: string | null; mac: string | null;
  model: string | null; currentVersion: string | null; targetVersion: string | null;
  detectedAtUtc: string; resolvedAtUtc: string | null;
  isAcknowledged: boolean; acknowledgedAtUtc: string | null; source: string | null;
}

export interface OfflineClient {
  id: number; name: string; hostname: string | null; ipAddress: string | null; macAddress: string | null;
  type: string | null; isDevice: boolean; subnetId: number | null; subnet: string | null; location: string | null;
  connectionType: string | null; connectionDetail: string | null;
  lastOnlineAt: string | null; ignoreOffline: boolean;
}
export interface OfflineClients {
  subnetName: string | null; showLastSeenTooltips: boolean; autoRefreshSeconds: number; items: OfflineClient[];
}

export interface AddDiscoveryBody {
  name: string; hostname: string; upstreamDeviceName: string; upstreamConnection: string;
}

export const alertsApi = {
  offline: (ack: boolean) => http.get<OfflineAlert[]>(`/alerts/offline?ack=${ack}`),
  ackOffline: (id: number) => http.post(`/alerts/offline/${id}/ack`),
  ignoreOffline: (id: number) => http.post(`/alerts/offline/${id}/ignore`),
  ackAllOffline: () => http.post<{ count: number }>('/alerts/offline/ack-all'),

  discovery: (ack: boolean) => http.get<DiscoveryAlert[]>(`/alerts/discovery?ack=${ack}`),
  ackDiscovery: (id: number) => http.post(`/alerts/discovery/${id}/ack`),
  ignoreDiscovery: (id: number) => http.post(`/alerts/discovery/${id}/ignore`),
  addDiscovery: (id: number, body?: AddDiscoveryBody) =>
    http.post<{ created: boolean }>(`/alerts/discovery/${id}/add`, body),
  ackAllDiscovery: () => http.post<{ count: number }>('/alerts/discovery/ack-all'),

  firmware: (ack: boolean) => http.get<FirmwareAlert[]>(`/alerts/firmware?ack=${ack}`),
  ackFirmware: (id: number) => http.post(`/alerts/firmware/${id}/ack`),
  ackAllFirmware: () => http.post<{ count: number }>('/alerts/firmware/ack-all'),

  offlineClients: (subnetId?: number) =>
    http.get<OfflineClients>(`/alerts/offline-clients${subnetId ? `?subnetId=${subnetId}` : ''}`),
  deleteClient: (id: number) => http.del(`/alerts/offline-clients/${id}`),
};
