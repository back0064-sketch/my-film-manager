import { ProjectData } from "@/types/project";

export function projectFinancialSummary(project: ProjectData) {
  const financeTasks = project.tasks.filter(
    (task) => task.moduleId === "Finance",
  );
  const batchIds = new Set(project.settlementBatches.map((batch) => batch.id));
  const outstandingPayable = financeTasks
    .filter((task) => task.transactionType !== "income" && !task.isPaid)
    .reduce((sum, task) => sum + task.amount, 0);
  const unbatchedReceivable = financeTasks
    .filter(
      (task) =>
        task.transactionType === "income" &&
        !task.isPaid &&
        (!task.settlementBatchId || !batchIds.has(task.settlementBatchId)),
    )
    .reduce((sum, task) => sum + task.amount, 0);
  const batchReceivable = project.settlementBatches
    .filter((batch) => batch.status !== "paid")
    .reduce((sum, batch) => sum + batch.total, 0);
  const legacyReceivable = project.monthlySettlements
    .filter((settlement) => settlement.status !== "paid")
    .reduce(
      (sum, settlement) =>
        sum + settlement.deliveredCount * settlement.unitPrice,
      0,
    );

  return {
    outstandingPayable,
    outstandingReceivable:
      unbatchedReceivable + batchReceivable + legacyReceivable,
  };
}
