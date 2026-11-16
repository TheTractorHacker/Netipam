import { http } from '../../http';

export interface LocationRow { id: number; name: string; description: string | null; assigned: number }
export interface LocationInput { name: string; description: string }

export interface LocationDevice {
  id: number; name: string; hostname: string | null; ipAddress: string | null; macAddress: string | null;
  type: string | null; subnetId: number | null; subnet: string | null;
  isOnline: boolean; isStatusTracked: boolean; accessHref: string | null;
}
export interface LocationDevices {
  location: { id: number; name: string; description: string | null };
  devices: LocationDevice[];
}

export interface ClientTypeRow {
  id: number; name: string; description: string | null; icon: string | null;
  isDevice: boolean; isHost: boolean; assigned: number;
}
export interface ClientTypeInput { name: string; description: string; icon: string | null; isDevice: boolean; isHost: boolean }
export interface IconOption { label: string; svg: string }

export const taxonomyApi = {
  locations: () => http.get<LocationRow[]>('/locations'),
  locationDevices: (id: number) => http.get<LocationDevices>(`/locations/${id}/devices`),
  createLocation: (b: LocationInput) => http.post('/locations', b),
  updateLocation: (id: number, b: LocationInput) => http.put(`/locations/${id}`, b),
  deleteLocation: (id: number) => http.del(`/locations/${id}`),

  clientTypes: () => http.get<ClientTypeRow[]>('/client-types'),
  icons: () => http.get<IconOption[]>('/client-types/icons'),
  createClientType: (b: ClientTypeInput) => http.post('/client-types', b),
  updateClientType: (id: number, b: ClientTypeInput) => http.put(`/client-types/${id}`, b),
  deleteClientType: (id: number) => http.del(`/client-types/${id}`),
};
