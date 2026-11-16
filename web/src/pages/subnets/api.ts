import { http } from '../../http';

export interface SubnetInput {
  name: string; cidr: string; description: string; vlanId: number | null;
  dhcpRangeStart: string; dhcpRangeEnd: string; dns1: string; dns2: string;
}

export interface SubnetRow {
  id: number; name: string; cidr: string; description: string | null; vlanId: number | null;
  dhcpRangeStart: string | null; dhcpRangeEnd: string | null; dns1: string | null; dns2: string | null;
  validCidr: boolean; usableRange: string | null; usable: number | null; total: number | null;
  usedIps: number; clients: number; devices: number; offline: number; nextFreeIps: string[];
}
export interface SubnetList { freeIpCount: number; items: SubnetRow[] }

export interface CidrPreview {
  valid: boolean; error: string | null; network?: string; broadcast?: string; prefix?: number;
  usableRange?: string; usable?: number; total?: number;
}

export type IpStatus = 'available' | 'reserved' | 'dhcp' | 'deprecated' | 'assignedStatic' | 'assignedDhcp';

export interface IpDevice {
  id: number; name: string; hostname: string | null; macAddress: string | null; ipDisplay: string;
  accessHref: string | null; type: string | null; isDevice: boolean;
  connectionType: string | null; connectionDetail: string | null;
  upstreamDeviceName: string | null; upstreamConnection: string | null; hosted: boolean;
  isOnline: boolean; isStatusTracked: boolean; lastSeenAt: string | null; lastOnlineAt: string | null;
}
export interface IpReservation { id: number; status: 'Reserved' | 'DHCP' | 'Deprecated'; notes: string | null; updatedUtc: string }
export interface IpRow {
  ip: string; status: IpStatus; isUsed: boolean; inDhcp: boolean; online: boolean;
  reservation: IpReservation | null; devices: IpDevice[];
}
/** One /24 slice of a large subnet (too big to draw per-IP). */
export interface IpBlock { cidr: string; used: number; online: number; offline: number; reserved: number; free: number; usable: number }
export interface SubnetIps {
  /** True when the subnet is too large for a per-IP map; `blocks` summarises it and `?block=` drills in. */
  large?: boolean;
  blocks?: IpBlock[];
  /** The block these rows cover (large subnets only). */
  block?: string | null;
  subnet: { id: number; name: string; cidr: string; description: string | null; vlanId: number | null;
    dhcpRangeStart: string | null; dhcpRangeEnd: string | null; dns1: string | null; dns2: string | null };
  error: string | null; usableRange: string | null; rows: IpRow[];
  options: { showTooltips: boolean; autoRefreshSeconds: number };
}

export const subnetsApi = {
  list: () => http.get<SubnetList>('/subnets'),
  create: (b: SubnetInput) => http.post('/subnets', b),
  update: (id: number, b: SubnetInput) => http.put(`/subnets/${id}`, b),
  remove: (id: number) => http.del(`/subnets/${id}`),
  cidr: (value: string) => http.get<CidrPreview>(`/subnets/cidr?value=${encodeURIComponent(value)}`),
  setFreeIpCount: (freeIpCount: number) => http.put<{ freeIpCount: number }>('/subnets/settings', { freeIpCount }),
  ips: (id: number, block?: string) =>
    http.get<SubnetIps>(`/subnets/${id}/ips${block ? `?block=${encodeURIComponent(block)}` : ''}`),
  saveReservation: (id: number, b: { ip: string; status: string; notes: string }) =>
    http.put(`/subnets/${id}/reservations`, b),
};
