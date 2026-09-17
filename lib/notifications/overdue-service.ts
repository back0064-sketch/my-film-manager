import 'server-only';

import { getOverdueNotificationConfig } from '@/lib/config/env';
import {
  buildOverdueFingerprint,
  buildOverdueItemsFromNormalized,
  buildOverdueItemsFromProjects,
  formatOverdueDigest,
  renderOverdueHtml,
  type NormalizedBatchRow,
  type NormalizedProjectRow,
  type NormalizedTaskRow,
} from '@/lib/notifications/overdue';
import { taipeiToday } from '@/lib/projects/work-command';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205' || /(project_(tasks|settlement)|overdue_notification)/i.test(error.message ?? '');
}

async function loadOverdueData(database: ReturnType<typeof createSupabaseServiceClient>, today: string) {
  const [projectsResult, clientsResult, tasksResult, batchesResult] = await Promise.all([
    database.from('film_projects').select('id, name, owner_id, client_id').order('updated_at', { ascending: false }),
    database.from('clients').select('id, name').order('name'),
    database.from('project_tasks').select('project_id, task_id, module_id, title, status, is_completed, due_date, transaction_type, amount, is_paid, settlement_batch_id, invoice_number, archived_at'),
    database.from('project_settlement_batches').select('project_id, batch_id, month, total, status, due_date, invoice_number'),
  ]);
  if (projectsResult.error) throw new Error(`讀取 Supabase 專案失敗：${projectsResult.error.message}`);
  if (clientsResult.error) throw new Error(`讀取 Supabase 客戶失敗：${clientsResult.error.message}`);

  const clientNames = new Map((clientsResult.data ?? []).map((client) => [String(client.id), client.name]));
  const projects = (projectsResult.data ?? []) as NormalizedProjectRow[];
  if (!tasksResult.error && !batchesResult.error) {
    return {
      normalized: true,
      projects,
      items: buildOverdueItemsFromNormalized(projects, (tasksResult.data ?? []) as NormalizedTaskRow[], (batchesResult.data ?? []) as NormalizedBatchRow[], clientNames, today),
    };
  }
  if ((tasksResult.error && !isMissingTableError(tasksResult.error)) || (batchesResult.error && !isMissingTableError(batchesResult.error))) {
    throw new Error(`讀取正規化資料失敗：${tasksResult.error?.message ?? batchesResult.error?.message ?? '未知錯誤'}`);
  }

  const legacyProjectsResult = await database.from('film_projects').select('id, name, owner_id, client_id, project_data').order('updated_at', { ascending: false });
  if (legacyProjectsResult.error) throw new Error(`讀取 JSONB 專案失敗：${legacyProjectsResult.error.message}`);
  return {
    normalized: false,
    projects,
    items: buildOverdueItemsFromProjects((legacyProjectsResult.data ?? []) as Array<{ id: string; name: string; owner_id: string | null; client_id?: string | null; project_data: unknown }>, clientNames, today),
  };
}

export async function sendOverdueNotifications(now = new Date()) {
  const config = getOverdueNotificationConfig();
  const today = taipeiToday(now);
  if (!config.resendApiKey || !config.resendFrom || !config.notificationTo || !config.ownerId) {
    return { ok: true, skipped: 'missing_configuration' as const, today };
  }

  const database = createSupabaseServiceClient();
  const data = await loadOverdueData(database, today);
  const items = data.items.filter((item) => data.projects.find((project) => String(project.id) === item.projectId)?.owner_id === config.ownerId);
  if (items.length === 0) return { ok: true, skipped: 'no_overdue_items' as const, today, normalized: data.normalized };

  const fingerprint = buildOverdueFingerprint(config.ownerId, today, items);
  const delivery = await database.from('overdue_notification_deliveries').select('fingerprint').eq('fingerprint', fingerprint).maybeSingle();
  if (delivery.error) {
    if (isMissingTableError(delivery.error)) throw new Error('逾期通知需要先套用 JSONB 正規化 migration');
    throw new Error(`讀取逾期通知紀錄失敗：${delivery.error.message}`);
  }
  if (delivery.data) return { ok: true, skipped: 'already_sent' as const, today, fingerprint, itemCount: items.length };

  const recipients = config.notificationTo.split(',').map((email) => email.trim()).filter(Boolean);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': fingerprint },
    body: JSON.stringify({
      from: config.resendFrom,
      to: recipients,
      subject: `【影視製片控制台】逾期提醒 ${today}（${items.length} 件）`,
      text: formatOverdueDigest(items, today),
      html: renderOverdueHtml(items, today),
    }),
  });
  if (!response.ok) throw new Error(`Resend 寄信失敗（${response.status}）：${(await response.text()).slice(0, 300)}`);

  const recorded = await database.from('overdue_notification_deliveries').insert({
    fingerprint,
    owner_id: config.ownerId,
    recipient: recipients.join(','),
    channel: 'email',
    item_count: items.length,
    metadata: { today, normalized: data.normalized },
  });
  if (recorded.error && recorded.error.code !== '23505') throw new Error(`寫入逾期通知紀錄失敗：${recorded.error.message}`);
  return { ok: true, sent: true, today, fingerprint, itemCount: items.length, normalized: data.normalized };
}
