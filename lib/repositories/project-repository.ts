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

export async function updateClient(id: string, client: Pick<Client, 'name' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes'>, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('clients').update({
    name: client.name,
    contact_name: client.contactName || null,
    contact_email: client.contactEmail || null,
    contact_phone: client.contactPhone || null,
    notes: client.notes || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('owner_id', ownerId).select('id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at').maybeSingle();
}

export async function moveClientProjects(sourceClientId: string, targetClientId: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').update({ client_id: targetClientId, updated_at: new Date().toISOString() }).eq('client_id', sourceClientId).eq('owner_id', ownerId);
}

export async function mergeClientsAtomically(sourceClientId: string, targetClientId: string) {
  const database = await createServerSupabaseClient();
  return database.rpc('merge_owned_clients', {
    source_client_id: sourceClientId,
    target_client_id: targetClientId,
  });
}

export async function findProject(id: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').select('id, name, updated_at, project_data').eq('id', id).eq('owner_id', ownerId).maybeSingle();
}

export async function saveProject(project: ProjectData, ownerId: string): Promise<{ data: FilmProjectRow | null; error: unknown }> {
  const database = await createServerSupabaseClient();
  const updatedAt = new Date().toISOString();
  const savedProject = { ...project, syncVersion: updatedAt };
  const payload = {
    id: project.id,
    name: project.name,
    project_data: savedProject,
    owner_id: ownerId,
    updated_at: updatedAt,
  };
  if (!project.syncVersion) {
    return database.from('film_projects').insert(payload).select('id, name, updated_at, project_data').single();
  }
  return database.from('film_projects')
    .update(payload)
    .eq('id', project.id)
    .eq('owner_id', ownerId)
    .eq('updated_at', project.syncVersion)
    .select('id, name, updated_at, project_data')
    .maybeSingle();
}

export async function removeProject(id: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').delete().eq('id', id).eq('owner_id', ownerId);
}
