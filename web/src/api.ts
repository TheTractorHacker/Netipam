export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export interface Me { authenticated: boolean; name: string; roles: string[] }
export interface SubnetRow {
  id: number; name: string; cidr: string; vlanId: number | null;
  usable: number; used: number; available: number; clients: number; devices: number; offline: number;
}
export interface Summary {
  clients: number; devices: number; wired: number; wireless: number; offline: number;
  offlineAlerts: number; newDevices: number; firmwareUpdates: number; subnets: SubnetRow[];
}
export interface DeviceRow {
  id: number; name: string; hostname: string | null; ipAddress: string | null; macAddress: string | null;
  manufacturer: string | null; model: string | null; type: string | null; isDevice: boolean;
  subnet: string | null; location: string | null; isOnline: boolean; isStatusTracked: boolean;
  isCritical: boolean; lastSeenAt: string | null;
}

export const api = {
  me: () => request<Me>('/auth/me'),
  login: (username: string, password: string, rememberMe: boolean) =>
    request<{ ok: boolean }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, rememberMe }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  summary: () => request<Summary>('/summary'),
  devices: (kind: 'device' | 'client' | 'all', q: string) =>
    request<DeviceRow[]>(`/devices?kind=${kind}&q=${encodeURIComponent(q)}`),
};
