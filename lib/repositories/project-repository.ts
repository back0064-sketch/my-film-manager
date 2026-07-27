import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Client, FilmProjectRow, ProjectData } from '@/types/project';

export async function findAllProjects(ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').select('id, name, client_id, updated_at, project_data, clients(name)').eq('owner_id', ownerId).order('updated_at', { ascending: false });
}

export async function assignProjectClient(id: string, clientId: string | null, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').update({ client_id: clientId, updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', ownerId);
}

export async function findAllClients(ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('clients').select('id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at').eq('owner_id', ownerId).order('name');
}

export async function createClient(client: Pick<Client, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes'>, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('clients').insert({
    name: client.name,
    contact_name: client.contactName || null,
    contact_email: client.contactEmail || null,
    contact_phone: client.contactPhone || null,
    notes: client.notes || null,
    owner_id: ownerId,
  }).select('id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at').single();
}

export async function removeClient(id: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('clients').delete().eq('id', id).eq('owner_id', ownerId);
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
