import { http } from '../../http';

export interface DeviceRow {
  id: number; name: string; hostname: string | null; ipAddress: string | null; macAddress: string | null;
  manufacturer: string | null; model: string | null; type: string | null; isDevice: boolean;
  subnet: string | null; location: string | null; isOnline: boolean; isStatusTracked: boolean;
  isCritical: boolean; lastSeenAt: string | null;
}
export const devicesApi = {
  list: (kind: 'device' | 'client' | 'all', q: string) =>
    http.get<DeviceRow[]>(`/devices?kind=${kind}&q=${encodeURIComponent(q)}`),
};
