import { http } from '../../http';

export interface SubnetRow {
  id: number; name: string; cidr: string; vlanId: number | null;
  usable: number; used: number; available: number; clients: number; devices: number; offline: number;
}
export interface Summary {
  clients: number; devices: number; wired: number; wireless: number; offline: number;
  offlineAlerts: number; newDevices: number; firmwareUpdates: number; subnets: SubnetRow[];
}
export const dashboardApi = { summary: () => http.get<Summary>('/summary') };
