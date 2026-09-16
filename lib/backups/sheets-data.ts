import type { MonthlySettlement, ProjectData, Task } from '@/types/project';

export const BACKUP_HEADERS = {
  projects: ['擁有者 ID', '專案 ID', '專案名稱', '客戶 ID', '客戶名稱', '專案類型', '包案制', '預算金額', '更新時間', '同步版本', '完整專案 JSON'],
  clients: ['擁有者 ID', '客戶 ID', '客戶名稱', '聯絡人', 'Email', '電話', '備註', '建立時間', '更新時間'],
  tasks: ['擁有者 ID', '專案 ID', '專案名稱', '任務 ID', '模組', '任務名稱', '狀態', '說明', '負責人', '截止日', '收支類型', '往來對象', '發票號碼', '付款方式', '收據連結', '交易日期', '可請款', '金額', '已付款', '關聯任務 ID', '前一狀態', '付款時間', '更新時間'],
  settlements: ['擁有者 ID', '專案 ID', '專案名稱', '月結 ID', '月份', '交付數量', '單價', '狀態', '發票日期', '付款時間', '備註'],
} as const;

export type ProjectRow = {
  id: string;
  name: string;
  owner_id: string | null;
  client_id: string | null;
  updated_at: string;
  project_data: ProjectData | null;
};

export type ClientRow = {
  id: string;
  owner_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BackupWorkbook = {
  status: (string | number)[][];
  projects: unknown[][];
  clients: unknown[][];
  tasks: unknown[][];
  settlements: unknown[][];
};

function yesNo(value: boolean | undefined) {
  return value ? '是' : '否';
}

function safeTasks(project: ProjectData | null): Task[] {
  return Array.isArray(project?.tasks) ? project.tasks : [];
}

function safeSettlements(project: ProjectData | null): MonthlySettlement[] {
  if (Array.isArray(project?.monthlySettlements) && project.monthlySettlements.length > 0) return project.monthlySettlements;
  return project?.monthlySettlement ? [project.monthlySettlement] : [];
}

export function buildBackupWorkbook(projects: ProjectRow[], clients: ClientRow[], syncedAt: string): BackupWorkbook {
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const taskRows = projects.flatMap((project) => safeTasks(project.project_data).map((task) => [
    project.owner_id ?? '', project.id, project.name, task.id, task.moduleId, task.title, task.status,
    task.description ?? '', task.assignee ?? '', task.dueDate ?? '', task.transactionType ?? '', task.counterparty ?? '',
    task.invoiceNumber ?? '', task.paymentMethod ?? '', task.receiptUrl ?? '', task.transactionDate ?? '',
    yesNo(task.readyForCollection), task.amount, yesNo(task.isPaid), task.linkedTaskId ?? '', task.previousStatus ?? '',
    task.paidAt ?? '', task.updatedAt,
  ]));
  const settlementRows = projects.flatMap((project) => safeSettlements(project.project_data).map((settlement) => [
    project.owner_id ?? '', project.id, project.name, settlement.id, settlement.month, settlement.deliveredCount,
    settlement.unitPrice, settlement.status, settlement.invoiceDate ?? '', settlement.paidAt ?? '', settlement.notes ?? '',
  ]));

  return {
    status: [
      ['影視製片控制台 Supabase 自動備份', ''], ['', ''], ['項目', '內容'], ['狀態', '同步成功'],
      ['最後同步時間', syncedAt], ['Supabase 專案', 'xmbpkmxrhxobqixqdyep'], ['同步方向', 'Supabase → Google 試算表'],
      ['專案筆數', projects.length], ['客戶筆數', clients.length], ['任務筆數', taskRows.length],
      ['月結款項筆數', settlementRows.length], ['', ''],
      ['使用原則', '本檔為單向可讀備份；請勿把試算表內容當成正式資料回寫 Supabase。'],
    ],
    projects: [[...BACKUP_HEADERS.projects], ...projects.map((project) => [
      project.owner_id ?? '', project.id, project.name, project.client_id ?? '',
      project.client_id ? clientNames.get(project.client_id) ?? '' : '', project.project_data?.projectType ?? '',
      yesNo(project.project_data?.isFlatRate), project.project_data?.budgetAmount ?? 0, project.updated_at,
      project.project_data?.syncVersion ?? '', JSON.stringify(project.project_data ?? {}),
    ])],
    clients: [[...BACKUP_HEADERS.clients], ...clients.map((client) => [
      client.owner_id, client.id, client.name, client.contact_name ?? '', client.contact_email ?? '',
      client.contact_phone ?? '', client.notes ?? '', client.created_at, client.updated_at,
    ])],
    tasks: [[...BACKUP_HEADERS.tasks], ...taskRows],
    settlements: [[...BACKUP_HEADERS.settlements], ...settlementRows],
  };
}
