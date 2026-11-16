import { http, upload } from '../../http';

export interface GeneralSettings {
  siteTitle: string; dateFormat: string; uiAutoRefreshSeconds: number; subnetFreeIpDisplayCount: number;
  updaterLogRetentionHours: number; uiShowWanStatus: boolean; themeName: string;
}
export interface UnifiStatus { lastRunUtc: string | null; lastChangedCount: number; lastError: string | null }
export interface UnifiSettings {
  baseUrl: string | null; siteName: string | null; authMode: 'Session' | 'ApiKey'; username: string | null;
  hasPassword: boolean; hasApiKey: boolean;
  updaterEnabled: boolean; updaterIntervalSeconds: number; knownClientCutoffDays: number;
  syncOnlineStatus: boolean; syncName: boolean; syncHostname: boolean; syncIpAddress: boolean;
  updateConnectionFields: boolean; syncManufacturer: boolean; syncModel: boolean;
  status: UnifiStatus;
}
export interface SettingsBundle {
  general: GeneralSettings; dateFormats: string[]; themes: { name: string; displayName: string }[]; unifi: UnifiSettings;
}
export interface UnifiSave extends Omit<UnifiSettings, 'hasPassword' | 'hasApiKey' | 'status'> {
  password?: string; apiKey?: string; clearPassword?: boolean; clearApiKey?: boolean;
}
export interface ProxmoxProfile {
  id: number; name: string; enabled: boolean; baseUrl: string; apiTokenId: string; hasToken: boolean;
  intervalSeconds: number; updateExistingHostAssignments: boolean; updateGuestClientType: boolean;
}
export interface ProxmoxSave {
  name: string; enabled: boolean; baseUrl: string; apiTokenId: string; apiTokenSecret?: string; clearSecret?: boolean;
  intervalSeconds: number; updateExistingHostAssignments: boolean; updateGuestClientType: boolean;
}
export interface TestResult { ok: boolean; message: string }
export interface ProxmoxSaveResult { profile: ProxmoxProfile; updaterScheduled: boolean; delaySeconds: number }

export const settingsApi = {
  get: () => http.get<SettingsBundle>('/settings'),
  publicInfo: () => http.get<{ siteTitle: string; dateFormat: string }>('/settings/public'),
  saveGeneral: (g: GeneralSettings) => http.put<{ ok: boolean }>('/settings/general', g),
  saveUnifi: (u: UnifiSave) => http.put<{ ok: boolean }>('/settings/unifi', u),
  testUnifi: () => http.post<TestResult>('/settings/unifi/test'),
  runUnifi: () => http.post<{ ok: boolean }>('/settings/unifi/run'),
  unifiStatus: () => http.get<UnifiStatus>('/settings/unifi/status'),
  proxmox: () => http.get<ProxmoxProfile[]>('/settings/proxmox'),
  createProxmox: (p: ProxmoxSave) => http.post<ProxmoxSaveResult>('/settings/proxmox', p),
  updateProxmox: (id: number, p: ProxmoxSave) => http.put<ProxmoxSaveResult>(`/settings/proxmox/${id}`, p),
  deleteProxmox: (id: number) => http.del<{ ok: boolean }>(`/settings/proxmox/${id}`),
  testProxmox: (b: { id?: number; baseUrl: string; apiTokenId: string; apiTokenSecret?: string }) =>
    http.post<TestResult>('/settings/proxmox/test', b),
  runProxmox: () => http.post<{ ok: boolean }>('/settings/proxmox/run'),
  restore: (file: File, confirm: string, password: string) => {
    const f = new FormData();
    f.append('file', file); f.append('confirm', confirm); f.append('password', password);
    return upload<{ deleted: number }>('/settings/restore', f).catch((e) => {
      if (e?.status === 413) throw new Error('Backup file is too large (max 200 MB).');
      throw e;
    });
  },
  reset: (confirm: string, password: string) => http.post<{ ok: boolean; deleted: number }>('/settings/reset', { confirm, password }),
};
