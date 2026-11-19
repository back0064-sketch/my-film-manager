import {
  ProjectData,
  ReceivableItem,
  ReceivableStatus,
  Task,
  WorkCommandItem,
  WorkCommandCounts,
} from '@/types/project';

const dateOnly = (value?: string) => value?.slice(0, 10) ?? '';

function finalStatus(project: ProjectData, task: Task) {
  return project.moduleConfigs
    .find((config) => config.moduleId === task.moduleId)
    ?.customStatuses.at(-1);
}

export function taipeiToday(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

function compareDueDates(a: { dueDate?: string; updatedAt: string }, b: { dueDate?: string; updatedAt: string }) {
  const aDue = dateOnly(a.dueDate);
  const bDue = dateOnly(b.dueDate);
  if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function buildWorkCommandItems(project: ProjectData, limit = 20): WorkCommandItem[] {
  if (project.archivedAt) return [];
  const waiting = new Set(project.waitingForClientTaskIds);
  return project.tasks
    .filter((task) => task.moduleId !== 'Finance' && !task.archivedAt && task.status !== finalStatus(project, task))
    .sort(compareDueDates)
    .slice(0, limit)
    .map((task) => ({
      taskId: task.id,
      projectId: project.id,
      projectName: project.name,
      title: task.title,
      status: task.status,
      moduleId: task.moduleId,
      dueDate: task.dueDate,
      waitingForClient: waiting.has(task.id) || undefined,
      updatedAt: task.updatedAt,
    }));
}

export function workCommandUrgency(item: Pick<WorkCommandItem, 'dueDate'>, today = taipeiToday()) {
  const due = dateOnly(item.dueDate);
  if (!due) return 'unscheduled' as const;
  if (due < today) return 'overdue' as const;
  if (due === today) return 'today' as const;
  return 'upcoming' as const;
}

export function sortWorkCommandItems(items: WorkCommandItem[]) {
  return [...items].sort(compareDueDates);
}

export function sortReceivableItems(items: ReceivableItem[]) {
  return [...items].sort(compareDueDates);
}

export function cleanPlannedCloseDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

export function incomeReceivableState(status: string, invoiceNumber?: string, linkedTaskId?: string, readyForCollection?: boolean): Pick<ReceivableItem, 'status' | 'awaitingDelivery'> {
  // Delivery can mark linked income ready for collection before any invoice is sent.
  if (invoiceNumber?.trim() || status === '已請款') return { status: 'invoiced' };
  return { status: 'pending', awaitingDelivery: Boolean(linkedTaskId && !readyForCollection) || undefined };
}

export function isPendingInvoice(item: ReceivableItem) {
  return item.status === 'pending' && !item.awaitingDelivery;
}

function receivableStatus(status: string): ReceivableStatus {
  return status === 'invoiced' ? 'invoiced' : 'pending';
}

export function buildReceivableItems(project: ProjectData, limit = 20): ReceivableItem[] {
  const batchIds = new Set(project.settlementBatches.map((batch) => batch.id));
  const batches = project.settlementBatches
    .filter((batch) => batch.status !== 'paid' && batch.total > 0)
    .map((batch): ReceivableItem => ({
      id: `batch:${batch.id}`,
      projectId: project.id,
      projectName: project.name,
      title: `${batch.month} 月結（${batch.items.length} 支）`,
      amount: batch.total,
      dueDate: batch.dueDate,
      invoiceDate: batch.invoiceDate,
      invoiceNumber: batch.invoiceNumber,
      month: batch.month,
      source: 'batch',
      status: receivableStatus(batch.status),
      updatedAt: batch.createdAt,
    }));

  const incomeTasks = project.tasks
    .filter((task) => task.moduleId === 'Finance' && task.transactionType === 'income' && !task.isPaid)
    .filter((task) => !task.settlementBatchId || !batchIds.has(task.settlementBatchId))
    .filter((task) => task.amount > 0)
    .map((task): ReceivableItem => ({
      id: `income:${task.id}`,
      projectId: project.id,
      projectName: project.name,
      title: task.title,
      amount: task.amount,
      dueDate: task.dueDate,
      invoiceDate: task.transactionDate,
      invoiceNumber: task.invoiceNumber,
      source: 'income',
      ...incomeReceivableState(task.status, task.invoiceNumber, task.linkedTaskId, task.readyForCollection),
      updatedAt: task.updatedAt,
    }));

  const legacy = project.monthlySettlements
    .filter((settlement) => settlement.status !== 'paid' && settlement.deliveredCount * settlement.unitPrice > 0)
    .map((settlement): ReceivableItem => ({
      id: `legacy:${settlement.id}`,
      projectId: project.id,
      projectName: project.name,
      title: `${settlement.month} 舊版月結（${settlement.deliveredCount} 支）`,
      amount: settlement.deliveredCount * settlement.unitPrice,
      invoiceDate: settlement.invoiceDate,
      month: settlement.month,
      source: 'legacy',
      status: settlement.status === 'invoiced' ? 'invoiced' : 'pending',
      updatedAt: settlement.invoiceDate ?? `${settlement.month}-01T00:00:00.000Z`,
    }));

  return sortReceivableItems([...batches, ...incomeTasks, ...legacy]).slice(0, limit);
}

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

export function receivableUrgency(item: Pick<ReceivableItem, 'dueDate'>, today = taipeiToday()) {
  const due = dateOnly(item.dueDate);
  if (!due) return 'noDue' as const;
  if (due < today) return 'overdue' as const;
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const dueTime = Date.parse(`${due}T00:00:00Z`);
  return dueTime - todayTime <= sevenDaysMs ? 'dueSoon' as const : 'notDue' as const;
}

export function isClosingSoon(plannedCloseDate: string | undefined, today: string) {
  const due = cleanPlannedCloseDate(plannedCloseDate);
  return due !== undefined && receivableUrgency({ dueDate: due }, today) !== 'notDue';
}

export const WORK_PREVIEW_LIMIT = 12;
export const RECEIVABLE_PREVIEW_LIMIT = 8;

export function summarizeCommandItems(tasks: WorkCommandItem[], receivables: ReceivableItem[], day = taipeiToday()) {
  const commandCounts: WorkCommandCounts = {
    day,
    tasks: { all: tasks.length, overdue: 0, today: 0, upcoming: 0, unscheduled: 0, waiting: 0 },
    receivables: { all: receivables.length, pending: 0, invoiced: 0, overdue: 0, dueSoon: 0 },
  };

  // Keep the first page of each filter, including items outside the overall preview.
  const workCommandItems = sortWorkCommandItems(tasks).filter((task, index) => {
    const urgency = workCommandUrgency(task, day);
    const firstByDate = ++commandCounts.tasks[urgency] <= WORK_PREVIEW_LIMIT;
    const firstWaiting = task.waitingForClient && ++commandCounts.tasks.waiting <= WORK_PREVIEW_LIMIT;
    return index < WORK_PREVIEW_LIMIT || firstByDate || firstWaiting;
  });
  const receivableItems = sortReceivableItems(receivables).filter((item, index) => {
    const urgency = receivableUrgency(item, day);
    if (urgency === 'overdue' || urgency === 'dueSoon') commandCounts.receivables[urgency]++;
    const firstPending = isPendingInvoice(item) && ++commandCounts.receivables.pending <= RECEIVABLE_PREVIEW_LIMIT;
    const firstInvoiced = item.status === 'invoiced' && ++commandCounts.receivables.invoiced <= RECEIVABLE_PREVIEW_LIMIT;
    return index < RECEIVABLE_PREVIEW_LIMIT || firstPending || firstInvoiced;
  });
  return { commandCounts, workCommandItems, receivableItems };
}

export function buildProjectCommandSummary(project: ProjectData, clientName?: string | null, day = taipeiToday()) {
  const tasks = buildWorkCommandItems(project, Infinity).map((item) => ({ ...item, clientName }));
  const receivables = buildReceivableItems(project, Infinity).map((item) => ({ ...item, clientName }));
  return summarizeCommandItems(tasks, receivables, day);
}
