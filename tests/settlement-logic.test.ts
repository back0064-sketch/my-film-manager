import { describe, expect, it, vi } from 'vitest';
import { cleanProjectData, createProjectData } from '@/lib/project-data';
import { closeSettlementMonth, correctUnsettledDeliveryDate, recordDeliveryCoveredByPayment, reopenSettlementBatch, settlementCandidates, updateSettlementBatch } from '@/lib/projects/settlement-logic';
import { projectFinancialSummary } from '@/lib/projects/project-summary';
import { buildMonthlyFinanceReport } from '@/lib/projects/finance-report';
import { addTaskToProject, updateTaskInProject } from '@/lib/projects/task-logic';

describe('按支月結', () => {
  it('只把已交付且未結算的影片納入指定月份', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'batch-id' });
    const base = { ...createProjectData('project-id', '長期客戶', 'shortVideoEditing'), defaultUnitPrice: 1200 };
    const created = addTaskToProject(base, '九月影片', 'Scripting', '待收素材', 'income', 1500);
    const production = created.tasks.find((task) => task.moduleId === 'Scripting')!;
    const delivered = updateTaskInProject(created, production.id, { status: '已交付', deliveredAt: '2026-09-10T00:00:00.000Z' });

    expect(settlementCandidates(delivered, '2026-09')).toHaveLength(1);
    const closed = closeSettlementMonth(delivered, '2026-09', '2026-09-30T12:00:00.000Z');

    expect(closed.settlementBatches[0]).toMatchObject({ id: 'batch-id', month: '2026-09', subtotal: 1500, total: 1500, status: 'draft' });
    expect(closed.tasks.find((task) => task.id === production.id)).toMatchObject({ settlementBatchId: 'batch-id', archivedAt: '2026-09-30T12:00:00.000Z' });
    vi.unstubAllGlobals();
  });

  it('草稿可撤銷，已請款後不可撤銷', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'batch-id' });
    const base = { ...createProjectData('project-id', '長期客戶', 'shortVideoEditing'), defaultUnitPrice: 1000 };
    const created = addTaskToProject(base, '影片', 'Scripting', '待收素材', 'income', 1000);
    const production = created.tasks.find((task) => task.moduleId === 'Scripting')!;
    const delivered = updateTaskInProject(created, production.id, { status: '已交付', deliveredAt: '2026-09-10T00:00:00.000Z' });
    const closed = closeSettlementMonth(delivered, '2026-09');

    expect(reopenSettlementBatch(closed, 'batch-id').settlementBatches).toHaveLength(0);
    const invoiced = updateSettlementBatch(closed, 'batch-id', { status: 'invoiced' }, '2026-10-01T00:00:00.000Z');
    expect(reopenSettlementBatch(invoiced, 'batch-id')).toEqual(invoiced);
    vi.unstubAllGlobals();
  });

  it('整批標示已收款時同步更新關聯收入', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'batch-id' });
    const base = createProjectData('project-id', '長期客戶', 'shortVideoEditing');
    const created = addTaskToProject(base, '影片', 'Scripting', '待收素材', 'income', 1000);
    const production = created.tasks.find((task) => task.moduleId === 'Scripting')!;
    const delivered = updateTaskInProject(created, production.id, { status: '已交付', deliveredAt: '2026-09-10T00:00:00.000Z' });
    const closed = closeSettlementMonth(delivered, '2026-09');
    const paid = updateSettlementBatch(closed, 'batch-id', { status: 'paid' }, '2026-10-05T00:00:00.000Z');

    expect(paid.tasks.find((task) => task.moduleId === 'Finance')).toMatchObject({ isPaid: true, paidAt: '2026-10-05T00:00:00.000Z' });
    vi.unstubAllGlobals();
  });

  it('修正漏登影片的月份並補入原已收款紀錄，原批與實收金額維持一致', () => {
    const base = createProjectData('project-id', '長期客戶', 'shortVideoEditing');
    const paidAt = '2026-08-28T02:00:00Z';
    const original = {
      id: 'august', month: '2026-08', status: 'paid' as const, items: Array.from({ length: 5 }, (_, index) => ({
        taskId: `original-${index}`, title: `原請款影片 ${index}`, deliveredAt: '2026-08-10', unitPrice: 1000,
      })), subtotal: 5000, total: 5000, adjustment: 0, createdAt: paidAt, paidAt,
    };
    const withBatch = { ...base, settlementBatches: [original] };
    const created = addTaskToProject(withBatch, '漏登影片', 'Scripting', '待收素材', 'income', 1000);
    const task = created.tasks.find((item) => item.moduleId === 'Scripting')!;
    const oldDate = updateTaskInProject(created, task.id, { status: '已交付', deliveredAt: '2026-11-18' });

    expect(recordDeliveryCoveredByPayment(oldDate, original.id, task.id)).toBe(oldDate);
    expect(correctUnsettledDeliveryDate(oldDate, task.id, '2026-08-32')).toBe(oldDate);
    const corrected = correctUnsettledDeliveryDate(oldDate, task.id, '2026-08-19');
    expect(settlementCandidates(corrected, '2026-11')).toEqual([]);
    expect(settlementCandidates(corrected, '2026-08')).toHaveLength(1);
    const result = recordDeliveryCoveredByPayment(corrected, original.id, task.id);
    expect(result.settlementBatches).toEqual([{ ...original, includedDeliveries: [{ taskId: task.id, title: '漏登影片', deliveredAt: '2026-08-19' }] }]);
    expect(result.tasks.find((item) => item.id === task.id)).toMatchObject({ settlementBatchId: original.id, archivedAt: expect.any(String) });
    expect(projectFinancialSummary(result).outstandingReceivable).toBe(0);
    expect(buildMonthlyFinanceReport(result.tasks, '2026-08').received).toBe(buildMonthlyFinanceReport(corrected.tasks, '2026-08').received);
    expect(cleanProjectData(JSON.parse(JSON.stringify(result)), result.id)?.settlementBatches[0].includedDeliveries).toEqual(result.settlementBatches[0].includedDeliveries);
    expect(recordDeliveryCoveredByPayment(result, original.id, task.id)).toBe(result);
    expect(correctUnsettledDeliveryDate(result, task.id, '2026-11-18')).toBe(result);
    expect(updateSettlementBatch(result, original.id, { status: 'draft' })).toBe(result);

    const priorPaidAt = '2026-11-18T08:00:00Z';
    const priorPaid = { ...corrected, tasks: corrected.tasks.map((item) => item.moduleId === 'Finance' ? { ...item, isPaid: true, paidAt: priorPaidAt } : item) };
    const recorded = recordDeliveryCoveredByPayment(priorPaid, original.id, task.id);
    expect(recorded.tasks.find((item) => item.moduleId === 'Finance')).toMatchObject({ amount: 0, isPaid: true, paidAt: priorPaidAt, description: expect.stringContaining('原登記入帳日 2026-11-18') });
    expect(recorded.settlementBatches[0].total).toBe(5000);
    expect(buildMonthlyFinanceReport(priorPaid.tasks, '2026-11').received).toBe(1000);
    expect(buildMonthlyFinanceReport(recorded.tasks, '2026-11').received).toBe(0);
  });
});
