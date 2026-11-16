import { http } from '../../http';

export interface TopoNode {
  id: number; name: string; hostname: string | null; ipAddress: string; macAddress: string | null;
  type: string | null; accessHref: string | null; isOnline: boolean; isStatusTracked: boolean;
  isTopologyRoot: boolean; isHosted: boolean; parentId: number | null; parentName: string | null;
  port: number | null; isWifi: boolean; wifiBand: '2.4' | '5' | '6' | null;
  connectionType: string | null; connectionDetail: string | null; connectionTooltip: string;
  upstreamName: string | null; upstreamMac: string | null; searchText: string;
  kind: 'root' | 'child' | 'unassigned';
}
export interface HostDevice {
  id: number; name: string; hostname: string | null; type: string | null; ipAddress: string;
  accessHref: string | null; isOnline: boolean; isStatusTracked: boolean; isProxmox: boolean;
}
export interface HostGroup { host: HostDevice; guests: HostDevice[] }

export const topologyApi = {
  topology: () => http.get<{ nodes: TopoNode[] }>('/topology'),
  hosts: () => http.get<{ hosts: HostGroup[] }>('/hosts'),
};
