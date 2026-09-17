import { describe, expect, it, vi } from 'vitest';
import { createProjectData } from '@/lib/project-data';
import { closeSettlementMonth, reopenSettlementBatch, settlementCandidates, updateSettlementBatch } from '@/lib/projects/settlement-logic';
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
});
