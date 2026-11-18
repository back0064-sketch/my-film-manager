import type { ClientRow, ProjectRow } from '@/lib/backups/sheets-data';

type BusinessBackup = { clients: ClientRow[]; projects: ProjectRow[] };

export function buildRestoreSql({ clients, projects }: BusinessBackup) {
  const encode = (rows: unknown[]) => Buffer.from(JSON.stringify(rows), 'utf8').toString('base64');
  return `-- 影視製片控制台｜營運資料備份 v1
-- 僅在隔離環境執行。請先建立相同 UUID 的登入帳號並部署專案的資料庫結構。
-- 包含客戶、專案與完整任務和月結 JSON。重複的主鍵會使還原交易失敗。
-- 正式專案來源未提供建立時間，隔離環境使用最後更新時間初始化此欄位。
begin;

insert into public.clients (id, owner_id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at)
select id, owner_id, name, contact_name, contact_email, contact_phone, notes, created_at, updated_at
from jsonb_populate_recordset(null::public.clients, convert_from(decode('${encode(clients)}', 'base64'), 'UTF8')::jsonb);

insert into public.film_projects (id, owner_id, name, client_id, created_at, updated_at, project_data)
select id, owner_id, name, client_id, updated_at, updated_at, project_data
from jsonb_populate_recordset(null::public.film_projects, convert_from(decode('${encode(projects)}', 'base64'), 'UTF8')::jsonb);

commit;
`;
}
