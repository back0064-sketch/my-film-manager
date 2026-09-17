import {
  ProjectData,
  ReceivableItem,
  ReceivableStatus,
  Task,
  WorkCommandItem,
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

const urgencyRank: Record<ReturnType<typeof workCommandUrgency>, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  unscheduled: 3,
};

export function sortWorkCommandItems(items: WorkCommandItem[], today = taipeiToday()) {
  return [...items].sort((a, b) => {
    const rankDifference = urgencyRank[workCommandUrgency(a, today)] - urgencyRank[workCommandUrgency(b, today)];
    return rankDifference || compareDueDates(a, b);
  });
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
      status: task.readyForCollection ? 'invoiced' : 'pending',
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

  return [...batches, ...incomeTasks, ...legacy]
    .sort((a, b) => {
      const aDue = dateOnly(a.dueDate);
      const bDue = dateOnly(b.dueDate);
      if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, limit);
}

export function receivableUrgency(item: Pick<ReceivableItem, 'dueDate'>, today = taipeiToday()) {
  const due = dateOnly(item.dueDate);
  if (!due) return 'noDue' as const;
  if (due < today) return 'overdue' as const;
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const dueTime = Date.parse(`${due}T00:00:00Z`);
  return dueTime - todayTime <= 7 * 24 * 60 * 60 * 1000 ? 'dueSoon' as const : 'notDue' as const;
}
