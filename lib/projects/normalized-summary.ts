import { cleanPlannedCloseDate, incomeReceivableState, summarizeCommandItems, taipeiToday } from '@/lib/projects/work-command';
import { ModuleId, ProjectListItem, ReceivableItem, WorkCommandItem } from '@/types/project';

/**
 * The lobby only needs these columns. Keeping the row shape here prevents the
 * page from accidentally re-introducing a full project_data fetch.
 */
export interface NormalizedTaskSummaryRow {
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
  ready_for_collection: boolean;
  invoice_number: string | null;
  linked_task_id?: string | null;
  transaction_date: string | null;
  updated_at: string | null;
  unit_price: number | string | null;
  delivered_at: string | null;
  settlement_batch_id: string | null;
  archived_at: string | null;
  source_project_updated_at: string | null;
}

export interface NormalizedBatchSummaryRow {
  project_id: string;
  batch_id: string;
  month: string;
  total: number | string | null;
  status: 'draft' | 'invoiced' | 'paid' | string;
  created_at_source: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  due_date: string | null;
  updated_at: string | null;
  source_project_updated_at: string | null;
}

export interface ProjectListMetadataRow {
  id: string;
  name: string;
  client_id: string | null;
  updated_at: string;
  payload_version?: string | null;
  archived_at?: string | null;
  planned_close_date?: string | null;
  waiting_task_ids?: string[] | null;
  clients?: { name: string }[] | { name: string } | null;
}

const modules = new Set<ModuleId>(['Scripting', 'OnSite', 'PostProduction', 'Finance']);

function moduleId(value: string): ModuleId {
  return modules.has(value as ModuleId) ? value as ModuleId : 'Scripting';
}

function amount(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function updatedAt(value: string | null | undefined, fallback: string) {
  return value || fallback;
}

function asWorkItem(row: NormalizedTaskSummaryRow, project: ProjectListMetadataRow, waiting: Set<string>): WorkCommandItem {
  return {
    taskId: row.task_id,
    projectId: project.id,
    projectName: project.name,
    clientName: projectListClientName(project),
    title: row.title,
    status: row.status,
    moduleId: moduleId(row.module_id),
    dueDate: row.due_date || undefined,
    waitingForClient: waiting.has(row.task_id) || undefined,
    updatedAt: updatedAt(row.updated_at, project.updated_at),
  };
}

export function projectListClientName(project: ProjectListMetadataRow) {
  if (Array.isArray(project.clients)) return project.clients[0]?.name ?? null;
  return project.clients?.name ?? null;
}

export function projectsNeedingSource(
  metadata: ProjectListMetadataRow[],
  tasks: NormalizedTaskSummaryRow[],
  batches: NormalizedBatchSummaryRow[],
) {
  const versions = new Map<string, string | null>();
  for (const row of [...tasks, ...batches]) {
    const version = row.source_project_updated_at;
    if (!versions.has(row.project_id)) versions.set(row.project_id, version);
    else if (versions.get(row.project_id) !== version) versions.set(row.project_id, null);
  }
  // The detail view converts legacy monthly settlements to finance entries.
  // Use that same conversion when projections still contain legacy batches.
  for (const batch of batches) {
    if (batch.batch_id.startsWith('legacy:')) versions.set(batch.project_id, null);
  }
  // Older payloads and empty projections also need the source reader, which
  // applies the same data cleanup as the project detail view.
  return metadata.filter((project) => versions.get(project.id) !== project.updated_at
    || !project.payload_version || Date.parse(project.payload_version) !== Date.parse(project.updated_at),
  ).map((project) => project.id);
}

export function buildNormalizedProjectList(
  metadata: ProjectListMetadataRow[],
  tasks: NormalizedTaskSummaryRow[],
  batches: NormalizedBatchSummaryRow[],
  day = taipeiToday(),
): ProjectListItem[] {
  const tasksByProject = new Map<string, NormalizedTaskSummaryRow[]>();
  const batchesByProject = new Map<string, NormalizedBatchSummaryRow[]>();
  tasks.forEach((task) => {
    const list = tasksByProject.get(task.project_id) ?? [];
    list.push(task);
    tasksByProject.set(task.project_id, list);
  });
  batches.forEach((batch) => {
    const list = batchesByProject.get(batch.project_id) ?? [];
    list.push(batch);
    batchesByProject.set(batch.project_id, list);
  });

  return metadata.map((project) => {
    const projectTasks = tasksByProject.get(project.id) ?? [];
    const projectBatches = batchesByProject.get(project.id) ?? [];
    const batchIds = new Set(projectBatches.map((batch) => batch.batch_id));
    const outstandingPayable = projectTasks
      .filter((task) => task.module_id === 'Finance' && task.transaction_type !== 'income' && !task.is_paid)
      .reduce((sum, task) => sum + amount(task.amount), 0);
    const outstandingIncome = projectTasks
      .filter((task) => task.module_id === 'Finance' && task.transaction_type === 'income' && !task.is_paid)
      .filter((task) => !task.settlement_batch_id || !batchIds.has(task.settlement_batch_id))
      .reduce((sum, task) => sum + amount(task.amount), 0);
    const outstandingBatches = projectBatches
      .filter((batch) => batch.status !== 'paid' && amount(batch.total) > 0)
      .reduce((sum, batch) => sum + amount(batch.total), 0);
    const waiting = new Set(Array.isArray(project.waiting_task_ids) ? project.waiting_task_ids : []);
    const workItems = project.archived_at ? [] : projectTasks
      .filter((task) => task.module_id !== 'Finance' && !task.archived_at && !task.is_completed)
      .map((task) => asWorkItem(task, project, waiting));
    const receivableItems: ReceivableItem[] = [
      ...projectBatches
        .filter((batch) => batch.status !== 'paid' && amount(batch.total) > 0)
        .map((batch) => ({
          id: `batch:${batch.batch_id}`,
          projectId: project.id,
          projectName: project.name,
          clientName: projectListClientName(project),
          title: `${batch.month} 月結`,
          amount: amount(batch.total),
          dueDate: batch.due_date || undefined,
          invoiceDate: batch.invoice_date || undefined,
          invoiceNumber: batch.invoice_number || undefined,
          month: batch.month,
          source: 'batch' as const,
          status: batch.status === 'invoiced' ? 'invoiced' as const : 'pending' as const,
          updatedAt: updatedAt(batch.updated_at, batch.created_at_source || project.updated_at),
        })),
      ...projectTasks
        .filter((task) => task.module_id === 'Finance' && task.transaction_type === 'income' && !task.is_paid)
        .filter((task) => !task.settlement_batch_id || !batchIds.has(task.settlement_batch_id))
        .filter((task) => amount(task.amount) > 0)
        .map((task) => ({
          id: `income:${task.task_id}`,
          projectId: project.id,
          projectName: project.name,
          clientName: projectListClientName(project),
          title: task.title,
          amount: amount(task.amount),
          dueDate: task.due_date || undefined,
          invoiceDate: task.transaction_date || undefined,
          invoiceNumber: task.invoice_number || undefined,
          source: 'income' as const,
          ...incomeReceivableState(task.status, task.invoice_number ?? undefined, task.linked_task_id ?? undefined, task.ready_for_collection),
          updatedAt: updatedAt(task.updated_at, project.updated_at),
        })),
    ];
    return {
      id: project.id,
      name: project.name,
      archivedAt: project.archived_at ?? undefined,
      plannedCloseDate: cleanPlannedCloseDate(project.planned_close_date),
      clientId: project.client_id,
      clientName: projectListClientName(project),
      updated_at: project.updated_at,
      taskCount: projectTasks.length,
      outstandingAmount: outstandingPayable,
      outstandingReceivable: outstandingIncome + outstandingBatches,
      outstandingPayable,
      ...summarizeCommandItems(workItems, receivableItems, day),
    };
  });
}
