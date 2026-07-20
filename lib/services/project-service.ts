import 'server-only';

import { cleanProjectData } from '@/lib/project-data';
import { requireUser } from '@/lib/auth/session';
import * as repository from '@/lib/repositories/project-repository';
import { FilmProjectRow, ProjectData, ProjectListItem } from '@/types/project';

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
  return ((data ?? []) as FilmProjectRow[]).map(({ id, name, updated_at }) => ({ id, name, updated_at }));
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
