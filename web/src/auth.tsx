import { useQuery } from '@tanstack/react-query';
import { http } from './http';

export interface Me { authenticated: boolean; name: string; roles: string[] }

export const authApi = {
  me: () => http.get<Me>('/auth/me'),
  login: (username: string, password: string, rememberMe: boolean) =>
    http.post<{ ok: boolean }>('/auth/login', { username, password, rememberMe }),
  logout: () => http.post<{ ok: boolean }>('/auth/logout'),
};

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: authApi.me });
}

/** Role checks mirroring the server policies: CanEdit = Admin|Editor, AdminOnly = Admin. */
export function useCan() {
  const roles = useMe().data?.roles ?? [];
  const admin = roles.includes('Admin');
  return { edit: admin || roles.includes('Editor'), admin };
}
