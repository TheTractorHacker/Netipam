import { http } from '../../http';

export interface Seg { kind: 'online' | 'offline' | 'unknown'; pct: number }
export interface SubnetCard {
  id: number; name: string; cidr: string; vlanId: number | null;
  usable: number; used: number; free: number; clients: number; devices: number; offline: number;
}
export interface WanRow { gateway: string; label: string; isUp: boolean | null; ip: string | null }
export interface OfflineAlert {
  id: number; deviceId: number | null; name: string | null; hostname: string | null; ip: string | null;
  connectionType: string | null; connectionDetail: string | null; upstream: string | null; host: string | null;
  location: string | null; rack: string | null; wentOfflineAtUtc: string; cameOnlineAtUtc: string | null;
}
export interface DiscoveryAlert {
  id: number; name: string | null; hostname: string | null; mac: string; ip: string | null;
  connectionType: string | null; upstream: string | null; upstreamConnection?: string | null; detectedAtUtc: string;
}
export interface FirmwareAlert {
  id: number; name: string | null; mac: string | null; model: string | null;
  current: string | null; target: string | null; detectedAtUtc: string;
}
export interface CriticalDevice {
  id: number; name: string; type: string | null; hostname: string | null; ip: string | null; macAddress: string | null;
  accessLink: string | null; subnetId: number | null; subnet: string | null;
  connectionType: string | null; connectionDetail: string | null; upstream: string | null;
  location: string | null; rack: string | null; isOnline: boolean; isStatusTracked: boolean; timeline: Seg[];
}
export interface DashboardData {
  nowUtc: string;
  settings: { autoRefreshSeconds: number; showWanStatus: boolean; dateFormat: string };
  updater: { lastRunUtc: string | null; lastError: string | null; lastChangedCount: number };
  totals: {
    clients: number; devices: number; wired: number; wifi: number; offlineClients: number;
    offlineAlerts: number; discoveryAlerts: number; firmwareAlerts: number; wanDown: boolean;
  };
  wan: WanRow[];
  subnets: SubnetCard[];
  offlineAlerts: OfflineAlert[];
  discoveryAlerts: DiscoveryAlert[];
  firmwareAlerts: FirmwareAlert[];
  criticalDevices: CriticalDevice[];
  windowStartUtc: string; windowEndUtc: string;
  clientTypes: { id: number; name: string }[];
}
export interface AddDiscoveryBody {
  name?: string; hostname?: string; ipAddress?: string; macAddress?: string;
  upstreamDeviceName?: string; upstreamConnection?: string; clientTypeId?: number | null;
}

export const dashboardApi = {
  get: () => http.get<DashboardData>('/dashboard'),
  // Alerts-area contract
  ackOffline: (id: number) => http.post(`/alerts/offline/${id}/ack`),
  ignoreOffline: (id: number) => http.post(`/alerts/offline/${id}/ignore`),
  ackDiscovery: (id: number) => http.post(`/alerts/discovery/${id}/ack`),
  ignoreDiscovery: (id: number) => http.post(`/alerts/discovery/${id}/ignore`),
  ackFirmware: (id: number) => http.post(`/alerts/firmware/${id}/ack`),
  // Dashboard-owned
  addDiscovery: (id: number, body: AddDiscoveryBody) => http.post(`/dashboard/discovery/${id}/add`, body),
};
