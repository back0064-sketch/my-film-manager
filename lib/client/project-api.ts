import { Client, ProjectData, ProjectListItem } from '@/types/project';

export type ConflictPayload = { remoteProject?: ProjectData | null; remoteUpdatedAt?: string | null };

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number, readonly details?: { conflict?: ConflictPayload }) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'API 請求失敗' }));
    throw new ApiClientError(typeof body.error === 'string' ? body.error : 'API 請求失敗', response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const projectApi = {
  list: () => request<ProjectListItem[]>('/api/projects'),
  get: (id: string) => request<ProjectData | null>(`/api/projects/${id}`),
  save: (project: ProjectData) => request<ProjectData>(`/api/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(project) }),
  remove: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  assignClient: (id: string, clientId: string | null) => request<void>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ clientId }) }),
  listClients: () => request<Client[]>('/api/clients'),
  createClient: (client: Pick<Client, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes'>) => request<Client>('/api/clients', { method: 'POST', body: JSON.stringify(client) }),
  updateClient: (id: string, client: Pick<Client, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes'>) => request<Client>(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(client) }),
  removeClient: (id: string) => request<void>(`/api/clients/${id}`, { method: 'DELETE' }),
  mergeClients: (sourceId: string, targetId: string) => request<void>('/api/clients/merge', { method: 'POST', body: JSON.stringify({ sourceId, targetId }) }),
  session: () => request<{ id: string; email?: string } | null>('/api/auth/session'),
  signIn: (email: string, password: string) => request<{ id: string; email?: string }>('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signUp: (email: string, password: string) => request<{ needsEmailConfirmation: boolean; email?: string }>('/api/auth/sign-up', { method: 'POST', body: JSON.stringify({ email, password }) }),
  requestPasswordReset: (email: string) => request<{ sent: boolean }>('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
  mfaStatus: () => request<{ factors: { id: string; type: string; friendlyName?: string; status: string; createdAt?: string; updatedAt?: string }[]; currentLevel: string | null; nextLevel: string | null }>('/api/auth/mfa'),
  mfaEnroll: (friendlyName?: string) => request<{ factorId: string; friendlyName?: string; qrCode?: string; secret?: string; uri?: string }>('/api/auth/mfa/enroll', { method: 'POST', body: JSON.stringify({ friendlyName }) }),
  mfaVerify: (factorId: string, code: string) => request<{ verified: boolean; currentLevel: string | null; nextLevel: string | null }>('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ factorId, code }) }),
  mfaUnenroll: (factorId: string) => request<void>('/api/auth/mfa', { method: 'DELETE', body: JSON.stringify({ factorId }) }),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
};
