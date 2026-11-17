// Read-only Production preflight. No SQL migrations or user data exports.
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !/^[a-z]{20}$/.test(ref) || !token) throw new Error('請在 production 環境設定 Supabase 專案代碼與管理權杖。');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('clients', 'film_projects', 'project_tasks', 'project_settlement_batches', 'project_settlement_items', 'backup_runs', 'overdue_notification_deliveries') order by tablename`, read_only: true }),
});
if (!response.ok) throw new Error(`資料庫預檢失敗（HTTP ${response.status}），請檢查權杖與專案狀態。`);
const rows = await response.json();
if (!Array.isArray(rows)) throw new Error('預檢回應格式不正確。');
const expected = ['clients', 'film_projects', 'project_tasks', 'project_settlement_batches', 'project_settlement_items', 'backup_runs', 'overdue_notification_deliveries'];
for (const table of expected) {
  const row = rows.find(row => row.tablename === table);
  if (!row || row.rowsecurity !== true) throw new Error(`資料表 ${table} 缺少或未啟用 RLS。`);
}
console.log('正式資料庫預檢通過：7 個預期資料表均已啟用 RLS。此檢查未修改資料庫。');
