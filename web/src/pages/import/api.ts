import { http } from '../../http';

export type Kind = 'new' | 'changed' | 'unchanged';

export interface SubnetRow {
  selected: boolean; kind: Kind; name: string | null; cidr: string; description: string | null;
  dhcpStart: string | null; dhcpEnd: string | null; vlanId: number | null; dns1: string | null; dns2: string | null;
}
export interface ClientRow {
  selected: boolean; kind: Kind; mac: string; name: string | null; hostname: string | null; ipAddress: string | null;
  manufacturer: string | null; isOnline: boolean; connectionType: string | null; connectionDetail: string | null;
  upstreamDeviceName: string | null; upstreamDeviceMac: string | null; upstreamConnection: string | null;
}
export interface InfraRow {
  selected: boolean; kind: Kind; mac: string; name: string | null; ipAddress: string | null; model: string | null;
  unifiType: string | null; mappedTypeName: string | null; mappedTypeId: number | null; isOnline: boolean;
  connectionDetail: string | null; upstreamDeviceName: string | null; upstreamDeviceMac: string | null; upstreamConnection: string | null;
}
export interface UpdateField { key: string; label: string; current: string | null; incoming: string | null; changed: boolean }
export interface UpdateRow {
  kind: Kind; mac: string; isOnline: boolean; connectionType: string | null; connectionDetail: string | null;
  upstreamDeviceName: string | null; upstreamDeviceMac: string | null; upstreamConnection: string | null;
  fields: UpdateField[]; apply: string[] | null;
}

export interface Preview<T> { rows: T[]; message: string; waitedSeconds: number; filteredStale: number }
export interface Commit { created: number; updated: number; fieldsApplied: number; message: string }

const base = '/import/unifi';
export const importApi = {
  test: () => http.post<{ ok: boolean; message: string }>(`${base}/test`),
  subnetsPreview: () => http.post<Preview<SubnetRow>>(`${base}/subnets/preview`),
  subnetsCommit: (rows: SubnetRow[]) => http.post<Commit>(`${base}/subnets/commit`, { rows }),
  devicesPreview: () => http.post<Preview<InfraRow>>(`${base}/devices/preview`),
  devicesCommit: (rows: InfraRow[]) => http.post<Commit>(`${base}/devices/commit`, { rows }),
  clientsPreview: () => http.post<Preview<ClientRow>>(`${base}/clients/preview`),
  clientsCommit: (rows: ClientRow[]) => http.post<Commit>(`${base}/clients/commit`, { rows }),
  updatesPreview: () => http.post<Preview<UpdateRow>>(`${base}/updates/preview`),
  updatesCommit: (rows: UpdateRow[]) => http.post<Commit>(`${base}/updates/commit`, { rows }),
};
