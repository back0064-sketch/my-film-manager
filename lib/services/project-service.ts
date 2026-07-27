import 'server-only';

import { cleanProjectData } from '@/lib/project-data';
import { requireUser } from '@/lib/auth/session';
import * as repository from '@/lib/repositories/project-repository';
import { Client, FilmProjectRow, ProjectData, ProjectListItem } from '@/types/project';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureProject(id: string, payload: unknown): ProjectData {
  if (!uuidPattern.test(id)) throw new Error('無效的專案 ID');
  const project = cleanProjectData(payload, id);
  if (!project || !project.name.trim()) throw new Error('專案資料格式不正確');
  return { ...project, id, name: project.name.trim() };
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const user = await requireUser();
  const { data, error } = await repository.findAllProjects(user.id);
  if (error) throw error;
  return ((data ?? []) as (FilmProjectRow & { client_id: string | null; clients: { name: string }[] | null })[]).map(({ id, name, client_id, clients, updated_at, project_data }) => {
    const project = cleanProjectData(project_data, id);
    const financeTasks = project?.tasks.filter((task) => task.moduleId === 'Finance') ?? [];
    const outstandingPayable = financeTasks.filter((task) => task.transactionType !== 'income' && !task.isPaid).reduce((sum, task) => sum + task.amount, 0);
    const outstandingReceivable = financeTasks.filter((task) => task.transactionType === 'income' && !task.isPaid).reduce((sum, task) => sum + task.amount, 0)
      + (project?.monthlySettlements ?? []).filter((settlement) => settlement.status !== 'paid').reduce((sum, settlement) => sum + settlement.deliveredCount * settlement.unitPrice, 0);
    return { id, name, clientId: client_id, clientName: clients?.[0]?.name ?? null, updated_at, taskCount: project?.tasks.length ?? 0, outstandingAmount: outstandingPayable, outstandingReceivable, outstandingPayable };
  });
}

function mapClient(row: { id: string; name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; notes: string | null; created_at: string; updated_at: string }): Client {
  return { id: row.id, name: row.name, contactName: row.contact_name ?? undefined, contactEmail: row.contact_email ?? undefined, contactPhone: row.contact_phone ?? undefined, notes: row.notes ?? undefined, created_at: row.created_at, updated_at: row.updated_at };
}

export async function listClients(): Promise<Client[]> {
  const user = await requireUser();
  const { data, error } = await repository.findAllClients(user.id);
  if (error) throw error;
  return (data ?? []).map(mapClient);
}

export async function addClient(payload: unknown): Promise<Client> {
  if (!payload || typeof payload !== 'object') throw new Error('客戶資料格式不正確');
  const source = payload as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) throw new Error('請輸入客戶名稱');
  const optional = (key: string) => typeof source[key] === 'string' ? source[key].trim() || undefined : undefined;
  const user = await requireUser();
  const { data, error } = await repository.createClient({ name, contactName: optional('contactName'), contactEmail: optional('contactEmail'), contactPhone: optional('contactPhone'), notes: optional('notes') }, user.id);
  if (error || !data) throw error ?? new Error('客戶建立失敗');
  return mapClient(data);
}

export async function deleteClient(id: string) {
  if (!uuidPattern.test(id)) throw new Error('無效的客戶 ID');
  const user = await requireUser();
  const { error } = await repository.removeClient(id, user.id);
  if (error) throw error;
}

export async function changeProjectClient(id: string, clientId: string | null) {
  if (!uuidPattern.test(id) || (clientId !== null && !uuidPattern.test(clientId))) throw new Error('無效的資料 ID');
  const user = await requireUser();
  if (clientId) {
    const { data, error } = await repository.findAllClients(user.id);
    if (error) throw error;
    if (!(data ?? []).some((client) => client.id === clientId)) throw new Error('找不到客戶');
  }
  const { error } = await repository.assignProjectClient(id, clientId, user.id);
  if (error) throw error;
}

export async function getProject(id: string): Promise<ProjectData | null> {
  const user = await requireUser();
  const { data, error } = await repository.findProject(id, user.id);
  if (error) throw error;
  return data ? cleanProjectData((data as FilmProjectRow).project_data, id) : null;
}

export async function upsertProject(id: string, payload: unknown): Promise<ProjectData> {
  const project = ensureProject(id, payload);
  const user = await requireUser();
  const { data, error } = await repository.saveProject(project, user.id);
  if (error || !data) throw error ?? new Error('專案儲存失敗');
  return cleanProjectData(data.project_data, id) ?? project;
}

export async function deleteProject(id: string) {
  if (!uuidPattern.test(id)) throw new Error('無效的專案 ID');
  const user = await requireUser();
  const { error } = await repository.removeProject(id, user.id);
  if (error) throw error;
}
