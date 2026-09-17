import { createHash } from 'node:crypto';
import { cleanProjectData } from '@/lib/project-data';
import { buildReceivableItems, buildWorkCommandItems, taipeiToday } from '@/lib/projects/work-command';

export type OverdueItem = {
  id: string;
  projectId: string;
  projectName: string;
  clientName?: string | null;
  category: '工作' | '收款' | '付款';
  title: string;
  dueDate: string;
  amount?: number;
  invoiceNumber?: string;
};

export type NormalizedProjectRow = {
  id: string;
  name: string;
  owner_id: string | null;
  client_id?: string | null;
};

export type NormalizedTaskRow = {
  project_id: string;
  task_id: string;
  module_id: string;
  title: string;
  status: string;
  is_completed: boolean;
  due_date: string | null;
  transaction_type: 'income' | 'expense' | null;
  amount: number | string | null;
  is_paid: boolean;
  settlement_batch_id: string | null;
  invoice_number: string | null;
  archived_at: string | null;
};

export type NormalizedBatchRow = {
  project_id: string;
  batch_id: string;
  month: string;
  total: number | string | null;
  status: 'draft' | 'invoiced' | 'paid' | string;
  due_date: string | null;
  invoice_number: string | null;
};

const dateOnly = (value?: string | null) => value?.slice(0, 10) ?? '';

function numeric(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOverdue(value: string | null | undefined, today: string) {
  const due = dateOnly(value);
  return Boolean(due && due < today);
}

export function buildOverdueItemsFromNormalized(
  projects: NormalizedProjectRow[],
  tasks: NormalizedTaskRow[],
  batches: NormalizedBatchRow[],
  clientNames: Map<string, string> = new Map(),
  today = taipeiToday(),
) {
  const projectMap = new Map(projects.map((project) => [String(project.id), project]));
  const items: OverdueItem[] = [];

  for (const task of tasks) {
    const project = projectMap.get(String(task.project_id));
    if (!project || !isOverdue(task.due_date, today) || task.archived_at || task.is_paid) continue;
    const amount = numeric(task.amount);
    if (task.module_id === 'Finance') {
      if (task.transaction_type !== 'income' && task.transaction_type !== 'expense') continue;
      if (amount <= 0) continue;
      // 月結批次本身是收入的唯一追款來源，避免同一筆金額寄兩次提醒。
      if (task.transaction_type === 'income' && task.settlement_batch_id) continue;
      items.push({
        id: `task:${task.project_id}:${task.task_id}`,
        projectId: String(project.id),
        projectName: project.name,
        clientName: project.client_id ? clientNames.get(String(project.client_id)) ?? null : null,
        category: task.transaction_type === 'income' ? '收款' : '付款',
        title: task.title,
        dueDate: dateOnly(task.due_date),
        amount,
        invoiceNumber: task.invoice_number ?? undefined,
      });
      continue;
    }
    if (task.is_completed) continue;
    items.push({
      id: `task:${task.project_id}:${task.task_id}`,
      projectId: String(project.id),
      projectName: project.name,
      clientName: project.client_id ? clientNames.get(String(project.client_id)) ?? null : null,
      category: '工作',
      title: task.title,
      dueDate: dateOnly(task.due_date),
    });
  }

  for (const batch of batches) {
    const project = projectMap.get(String(batch.project_id));
    if (!project || batch.status === 'paid' || !isOverdue(batch.due_date, today)) continue;
    const amount = numeric(batch.total);
    if (amount <= 0) continue;
    items.push({
      id: `batch:${batch.project_id}:${batch.batch_id}`,
      projectId: String(project.id),
      projectName: project.name,
      clientName: project.client_id ? clientNames.get(String(project.client_id)) ?? null : null,
      category: '收款',
      title: `${batch.month} 月結`,
      dueDate: dateOnly(batch.due_date),
      amount,
      invoiceNumber: batch.invoice_number ?? undefined,
    });
  }

  return sortOverdueItems(items);
}

export function buildOverdueItemsFromProjects(
  projects: Array<{ id: string; name: string; owner_id: string | null; client_id?: string | null; project_data: unknown }>,
  clientNames: Map<string, string> = new Map(),
  today = taipeiToday(),
) {
  return sortOverdueItems(projects.flatMap((row) => {
    const project = cleanProjectData(row.project_data, row.id);
    if (!project) return [];
    const clientName = row.client_id ? clientNames.get(row.client_id) ?? null : null;
    const work = buildWorkCommandItems(project, 200)
      .filter((item) => isOverdue(item.dueDate, today))
      .map((item): OverdueItem => ({
        id: `task:${row.id}:${item.taskId}`,
        projectId: row.id,
        projectName: row.name,
        clientName,
        category: '工作',
        title: item.title,
        dueDate: dateOnly(item.dueDate),
      }));
    const receivables = buildReceivableItems(project, 200)
      .filter((item) => isOverdue(item.dueDate, today))
      .map((item): OverdueItem => ({
        id: `${item.source}:${row.id}:${item.id}`,
        projectId: row.id,
        projectName: row.name,
        clientName,
        category: '收款',
        title: item.title,
        dueDate: dateOnly(item.dueDate),
        amount: item.amount,
        invoiceNumber: item.invoiceNumber,
      }));
    return [...work, ...receivables];
  }));
}

export function sortOverdueItems(items: OverdueItem[]) {
  return [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.projectName.localeCompare(b.projectName) || a.title.localeCompare(b.title));
}

export function buildOverdueFingerprint(ownerId: string, today: string, items: OverdueItem[]) {
  const source = items.map((item) => `${item.id}:${item.dueDate}:${item.amount ?? ''}`).sort().join('|');
  return `overdue:${ownerId}:${today}:${createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}

export function formatOverdueDigest(items: OverdueItem[], today: string) {
  const lines = items.map((item) => {
    const amount = item.amount && item.amount > 0 ? `｜${item.amount.toLocaleString('zh-TW')} 元` : '';
    const client = item.clientName ? `｜${item.clientName}` : '';
    return `- ${item.category}｜${item.dueDate}｜${item.projectName}${client}｜${item.title}${amount}`;
  });
  return `影視製片控制台逾期提醒（${today}）\n\n${lines.join('\n')}`;
}

export function renderOverdueHtml(items: OverdueItem[], today: string) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
  const rows = items.map((item) => `<tr><td>${escape(item.category)}</td><td>${escape(item.dueDate)}</td><td>${escape(item.projectName)}</td><td>${escape(item.clientName ?? '')}</td><td>${escape(item.title)}</td><td>${item.amount && item.amount > 0 ? item.amount.toLocaleString('zh-TW') : ''}</td></tr>`).join('');
  return `<html><body><h2>影視製片控制台逾期提醒</h2><p>日期：${escape(today)}，共 ${items.length} 件。</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>類型</th><th>期限</th><th>專案</th><th>客戶</th><th>項目</th><th>金額</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
