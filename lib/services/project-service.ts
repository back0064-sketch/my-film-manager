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
  const existing = await repository.findAllClients(user.id);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).some((client) => client.name.trim().toLocaleLowerCase('zh-TW') === name.toLocaleLowerCase('zh-TW'))) throw new Error('已有相同名稱的客戶，請編輯或合併既有客戶');
  const { data, error } = await repository.createClient({ name, contactName: optional('contactName'), contactEmail: optional('contactEmail'), contactPhone: optional('contactPhone'), notes: optional('notes') }, user.id);
  if (error || !data) throw error ?? new Error('客戶建立失敗');
  return mapClient(data);
}

export async function updateClient(id: string, payload: unknown): Promise<Client> {
  if (!uuidPattern.test(id) || !payload || typeof payload !== 'object') throw new Error('客戶資料格式不正確');
  const source = payload as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) throw new Error('請輸入客戶名稱');
  const optional = (key: string) => typeof source[key] === 'string' ? source[key].trim() || undefined : undefined;
  const user = await requireUser();
  const clients = await repository.findAllClients(user.id);
  if (clients.error) throw clients.error;
  if ((clients.data ?? []).some((client) => client.id !== id && client.name.trim().toLocaleLowerCase('zh-TW') === name.toLocaleLowerCase('zh-TW'))) throw new Error('已有相同名稱的客戶，請改用合併功能');
  const { data, error } = await repository.updateClient(id, { name, contactName: optional('contactName'), contactEmail: optional('contactEmail'), contactPhone: optional('contactPhone'), notes: optional('notes') }, user.id);
  if (error || !data) throw error ?? new Error('找不到客戶');
  return mapClient(data);
}

export async function mergeClients(sourceId: string, targetId: string) {
  if (!uuidPattern.test(sourceId) || !uuidPattern.test(targetId) || sourceId === targetId) throw new Error('無效的客戶合併資料');
  const user = await requireUser();
  const clients = await repository.findAllClients(user.id);
  if (clients.error) throw clients.error;
  const ownedIds = new Set((clients.data ?? []).map((client) => client.id));
  if (!ownedIds.has(sourceId) || !ownedIds.has(targetId)) throw new Error('找不到客戶');
  const moved = await repository.moveClientProjects(sourceId, targetId, user.id);
  if (moved.error) throw moved.error;
  const removed = await repository.removeClient(sourceId, user.id);
  if (removed.error) throw removed.error;
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
  if (!data) return null;
  const row = data as FilmProjectRow;
  const project = cleanProjectData(row.project_data, id);
  return project ? { ...project, syncVersion: row.updated_at } : null;
}

export async function upsertProject(id: string, payload: unknown): Promise<ProjectData> {
  const project = ensureProject(id, payload);
  const user = await requireUser();
  const { data, error } = await repository.saveProject(project, user.id);
  if (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') throw new Error('同步衝突：雲端已存在同一專案');
    throw error;
  }
  if (!data) throw new Error('同步衝突：雲端專案已被其他裝置更新');
  const saved = cleanProjectData(data.project_data, id) ?? project;
  return { ...saved, syncVersion: data.updated_at };
}

export async function deleteProject(id: string) {
  if (!uuidPattern.test(id)) throw new Error('無效的專案 ID');
  const user = await requireUser();
  const { error } = await repository.removeProject(id, user.id);
  if (error) throw error;
}
