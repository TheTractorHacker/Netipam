import { http } from '../../http';

export interface DeviceHit {
  id: number; name: string; detail: string; ip: string | null; mac: string | null;
  type: string | null; location: string | null; subnet: string | null; online: boolean; isDevice: boolean;
}
export interface SubnetHit { id: number; name: string; cidr: string; vlanId: number | null; description: string | null }
export interface IpHit {
  id: number; ip: string; subnetId: number; subnetName: string | null; status: string;
  deviceId: number | null; device: string | null; notes: string | null;
}
export interface LocationHit { id: number; name: string }
export interface RackHit { id: number; name: string; description: string | null; location: string | null; rackUnits: number | null }

export interface SearchResult {
  query: string;
  devices: DeviceHit[]; devicesTruncated: boolean;
  subnets: SubnetHit[]; ips: IpHit[]; locations: LocationHit[]; racks: RackHit[];
}

export const searchApi = {
  search: (q: string, compact = false) =>
    http.get<SearchResult>(`/search?q=${encodeURIComponent(q)}${compact ? '&compact=true' : ''}`),
};
