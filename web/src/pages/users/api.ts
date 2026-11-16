import { http } from '../../http';

export interface UserRow { id: string; username: string; roles: string[]; isSelf: boolean }
export interface UsersResponse { users: UserRow[]; allRoles: string[] }

export const usersApi = {
  list: () => http.get<UsersResponse>('/users'),
  create: (b: { username: string; password: string; role: string | null }) => http.post<{ id: string }>('/users', b),
  setRoles: (id: string, roles: string[]) => http.put<{ ok: boolean }>(`/users/${encodeURIComponent(id)}/roles`, { roles }),
  resetPassword: (id: string, newPassword: string) =>
    http.post<{ ok: boolean }>(`/users/${encodeURIComponent(id)}/reset-password`, { newPassword }),
  remove: (id: string) => http.del<{ ok: boolean }>(`/users/${encodeURIComponent(id)}`),
  changeMyPassword: (currentPassword: string, newPassword: string) =>
    http.post<{ ok: boolean }>('/account/password', { currentPassword, newPassword }),
  setupStatus: () => http.get<{ needed: boolean }>('/auth/setup-status'),
  setup: (username: string, password: string, confirmPassword: string) =>
    http.post<{ ok: boolean }>('/auth/setup', { username, password, confirmPassword }),
};
