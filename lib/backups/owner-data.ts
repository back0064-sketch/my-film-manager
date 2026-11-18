import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLoginConfig } from '@/lib/auth/login-config';
import type { ClientRow, ProjectRow } from '@/lib/backups/sheets-data';

export const OWNER_SHEETS_BACKUP_KIND = 'owner_google_sheets';

export function requireBackupOwner() {
  const { ownerId } = getLoginConfig();
  if (!ownerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) {
    throw new Error('備份需要有效的 AUTH_OWNER_ID');
  }
  return ownerId.toLowerCase();
}

async function readOwnerRows<Row extends { id: string; owner_id: string | null }>(
  database: SupabaseClient, table: 'film_projects' | 'clients', columns: string, ownerId: string,
) {
  const rows: Row[] = [];
  let lastId: string | undefined;
  for (;;) {
    const query = database.from(table).select(columns).eq('owner_id', ownerId).order('id').limit(200);
    const { data, error } = await (lastId ? query.gt('id', lastId) : query).returns<Row[]>();
    if (error) throw new Error(`備份讀取 ${table} 失敗（${error.code}）`);
    if (data.length === 0) return rows;
    if (data.some((row) => row.owner_id !== ownerId)) throw new Error('備份包含其他帳號的資料，已停止匯出');
    rows.push(...data);
    lastId = data.at(-1)!.id;
  }
}

export async function readOwnerBackup(database: SupabaseClient, ownerId: string) {
  const [projects, clients] = await Promise.all([
    readOwnerRows<ProjectRow & { created_at: string }>(database, 'film_projects', 'id, name, owner_id, client_id, created_at, updated_at, project_data', ownerId),
    readOwnerRows<ClientRow>(database, 'clients', 'id, owner_id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at', ownerId),
  ]);
  const clientIds = new Set(clients.map((client) => client.id));
  if (projects.some((project) => project.client_id && !clientIds.has(project.client_id))) {
    throw new Error('備份的專案與客戶關聯不完整，已停止匯出');
  }
  return { ownerId, projects, clients };
}
