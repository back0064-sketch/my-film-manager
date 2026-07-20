import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { FilmProjectRow, ProjectData } from '@/types/project';

export async function findAllProjects(ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').select('id, name, updated_at, project_data').eq('owner_id', ownerId).order('updated_at', { ascending: false });
}

export async function findProject(id: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').select('id, name, updated_at, project_data').eq('id', id).eq('owner_id', ownerId).maybeSingle();
}

export async function saveProject(project: ProjectData, ownerId: string): Promise<{ data: FilmProjectRow | null; error: unknown }> {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').upsert({
    id: project.id,
    name: project.name,
    project_data: project,
    owner_id: ownerId,
    updated_at: new Date().toISOString(),
  }).select('id, name, updated_at, project_data').single();
}

export async function removeProject(id: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').delete().eq('id', id).eq('owner_id', ownerId);
}
