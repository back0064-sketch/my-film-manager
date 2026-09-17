import {
  ProjectData,
  SettlementBatch,
  SettlementBatchStatus,
  Task,
} from "@/types/project";

function finalStatus(project: ProjectData, task: Task) {
  return project.moduleConfigs
    .find((config) => config.moduleId === task.moduleId)
    ?.customStatuses.at(-1);
}

function linkedIncome(project: ProjectData, task: Task) {
  return project.tasks.find(
    (item) =>
      item.moduleId === "Finance" &&
      item.transactionType === "income" &&
      (item.linkedTaskId === task.id || item.id === task.linkedTaskId),
  );
}

export function settlementCandidates(project: ProjectData, month: string) {
  return project.tasks.filter(
    (task) =>
      task.moduleId !== "Finance" &&
      !task.archivedAt &&
      !task.settlementBatchId &&
      task.status === finalStatus(project, task) &&
      (!task.deliveredAt || task.deliveredAt.startsWith(month)),
  );
}

export function taskSettlementPrice(project: ProjectData, task: Task) {
  return Math.max(
    0,
    task.unitPrice ??
      linkedIncome(project, task)?.amount ??
      project.defaultUnitPrice,
  );
}

export function closeSettlementMonth(
  project: ProjectData,
  month: string,
  now = new Date().toISOString(),
): ProjectData {
  const candidates = settlementCandidates(project, month);
  if (candidates.length === 0) return project;

  const current = project.settlementBatches.find(
    (batch) => batch.month === month,
  );
  if (current && current.status !== "draft") return project;

  const batchId = current?.id ?? crypto.randomUUID();
  const newItems = candidates.map((task) => ({
    taskId: task.id,
    title: task.title,
    unitPrice: taskSettlementPrice(project, task),
    deliveredAt: task.deliveredAt ?? `${month}-01T00:00:00.000Z`,
  }));
  const items = [...(current?.items ?? []), ...newItems];
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice, 0);
  const adjustment = current?.adjustment ?? 0;
  const batch: SettlementBatch = {
    id: batchId,
    month,
    items,
    subtotal,
    adjustment,
    total: Math.max(0, subtotal + adjustment),
    status: "draft",
    createdAt: current?.createdAt ?? now,
    invoiceDate: current?.invoiceDate,
    invoiceNumber: current?.invoiceNumber,
    dueDate: current?.dueDate,
    paidAt: current?.paidAt,
    notes: current?.notes,
  };
  const candidateIds = new Set(candidates.map((task) => task.id));

  return {
    ...project,
    tasks: project.tasks.map((task) => {
      if (candidateIds.has(task.id)) {
        return {
          ...task,
          deliveredAt: task.deliveredAt ?? `${month}-01T00:00:00.000Z`,
          settlementBatchId: batchId,
          archivedAt: now,
          updatedAt: now,
        };
      }
      const belongsToCandidate =
        task.moduleId === "Finance" &&
        task.transactionType === "income" &&
        candidates.some(
          (candidate) =>
            task.linkedTaskId === candidate.id ||
            task.id === candidate.linkedTaskId,
        );
      return belongsToCandidate
        ? { ...task, settlementBatchId: batchId, updatedAt: now }
        : task;
    }),
    settlementBatches: current
      ? project.settlementBatches.map((item) =>
          item.id === batchId ? batch : item,
        )
      : [...project.settlementBatches, batch],
  };
}

export function updateSettlementBatch(
  project: ProjectData,
  id: string,
  updates: Partial<
    Pick<
      SettlementBatch,
      "adjustment" | "invoiceDate" | "invoiceNumber" | "dueDate" | "notes" | "status"
    >
  >,
  now = new Date().toISOString(),
): ProjectData {
  const current = project.settlementBatches.find((batch) => batch.id === id);
  if (!current) return project;
  const status: SettlementBatchStatus = updates.status ?? current.status;
  const adjustment =
    updates.adjustment === undefined ? current.adjustment : updates.adjustment;
  const batch = {
    ...current,
    ...updates,
    adjustment,
    total: Math.max(0, current.subtotal + adjustment),
    status,
    invoiceDate:
      status === "invoiced" && !updates.invoiceDate && !current.invoiceDate
        ? now.slice(0, 10)
        : (updates.invoiceDate ?? current.invoiceDate),
    paidAt: status === "paid" ? (current.paidAt ?? now) : undefined,
  };
  return {
    ...project,
    settlementBatches: project.settlementBatches.map((item) =>
      item.id === id ? batch : item,
    ),
    tasks:
      status === current.status
        ? project.tasks
        : project.tasks.map((task) =>
            task.settlementBatchId !== id || task.moduleId !== "Finance"
              ? task
              : {
                  ...task,
                  isPaid: status === "paid",
                  paidAt: status === "paid" ? batch.paidAt : undefined,
                  updatedAt: now,
                },
          ),
  };
}

export function reopenSettlementBatch(
  project: ProjectData,
  id: string,
  now = new Date().toISOString(),
): ProjectData {
  const batch = project.settlementBatches.find((item) => item.id === id);
  if (!batch || batch.status !== "draft") return project;
  return {
    ...project,
    settlementBatches: project.settlementBatches.filter(
      (item) => item.id !== id,
    ),
    tasks: project.tasks.map((task) =>
      task.settlementBatchId !== id
        ? task
        : {
            ...task,
            settlementBatchId: undefined,
            archivedAt: undefined,
            updatedAt: now,
          },
    ),
  };
}
