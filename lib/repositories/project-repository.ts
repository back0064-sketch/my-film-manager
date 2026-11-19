import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Client, FilmProjectRow, ProjectData } from '@/types/project';
import { NormalizedBatchSummaryRow, NormalizedTaskSummaryRow, ProjectListMetadataRow } from '@/lib/projects/normalized-summary';

export async function findAllProjects(ownerId: string, projectIds?: string[]) {
  const database = await createServerSupabaseClient();
  const rows: (FilmProjectRow & ProjectListMetadataRow)[] = [];
  let lastId: string | undefined;
  for (;;) {
    let query = database.from('film_projects').select('id, name, client_id, updated_at, project_data, clients(name)', { count: 'exact' })
      .eq('owner_id', ownerId).order('id').limit(200);
    if (projectIds) query = query.in('id', projectIds);
    if (lastId) query = query.gt('id', lastId);
    const { data, error, count } = await query.returns<typeof rows>();
    if (error) return { data: null, error };
    if (!data.length) return { data: rows, error: null };
    rows.push(...data);
    if (count === data.length) return { data: rows, error: null };
    lastId = data.at(-1)!.id;
  }
}

export async function findProjectListMetadata(ownerId: string) {
  const database = await createServerSupabaseClient();
  return database
    .from('film_projects')
    .select('id, name, client_id, updated_at, payload_version:project_data->>syncVersion, archived_at:project_data->>archivedAt, clients(name)', { count: 'exact' })
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false }).returns<ProjectListMetadataRow[]>();
}

export async function findNormalizedProjectSummary(ownerId: string) {
  const database = await createServerSupabaseClient();
  const [tasks, batches] = await Promise.all([
    database
      .from('project_tasks')
      .select('project_id, task_id, module_id, title, status, is_completed, due_date, transaction_type, amount, is_paid, ready_for_collection, invoice_number, transaction_date, updated_at:source_updated_at, unit_price, delivered_at, settlement_batch_id, archived_at, source_project_updated_at', { count: 'exact' })
      .eq('owner_id', ownerId).returns<NormalizedTaskSummaryRow[]>(),
    database
      .from('project_settlement_batches')
      .select('project_id, batch_id, month, total, status, created_at_source, invoice_date, invoice_number, due_date, updated_at:source_project_updated_at, source_project_updated_at', { count: 'exact' })
      .eq('owner_id', ownerId).returns<NormalizedBatchSummaryRow[]>(),
  ]);
  return { tasks, batches };
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
  const previousTime = Date.parse(project.syncVersion ?? '');
  const updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
  const savedProject = { ...project, syncVersion: updatedAt };
  const payload = {
    id: project.id,
    name: project.name,
    project_data: savedProject,
    owner_id: ownerId,
    updated_at: updatedAt,
  };
  const result = !project.syncVersion
    ? await database.from('film_projects').insert(payload).select('id, name, updated_at, project_data').single()
    : await database.from('film_projects')
      .update(payload)
      .eq('id', project.id)
      .eq('owner_id', ownerId)
      .eq('updated_at', project.syncVersion)
      .select('id, name, updated_at, project_data')
      .maybeSingle();

  if (!result.error && result.data) await bestEffortNormalizeProject(database, project.id);
  return result as { data: FilmProjectRow | null; error: unknown };
}

async function bestEffortNormalizeProject(database: Awaited<ReturnType<typeof createServerSupabaseClient>>, projectId: string) {
  const normalized = await database.rpc('normalize_project_data', { p_project_id: projectId });
  if (!normalized.error) return;
  const error = normalized.error as { code?: string; message?: string };
  const migrationNotApplied = error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01';
  if (!migrationNotApplied) console.warn('專案 JSONB 正規化同步失敗，保留原始資料', error.message ?? error);
}

export async function removeProject(id: string, ownerId: string) {
  const database = await createServerSupabaseClient();
  return database.from('film_projects').delete().eq('id', id).eq('owner_id', ownerId);
}
