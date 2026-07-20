import { Client, ProjectData, ProjectListItem } from '@/types/project';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'API 請求失敗' }));
    throw new Error(body.error);
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
  session: () => request<{ id: string; email?: string } | null>('/api/auth/session'),
  signIn: (email: string, password: string) => request<{ id: string; email?: string }>('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signUp: (email: string, password: string) => request<{ needsEmailConfirmation: boolean; email?: string }>('/api/auth/sign-up', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
};
