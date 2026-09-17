import { describe, expect, it } from 'vitest';
import { createProjectData } from '@/lib/project-data';
import {
  buildReceivableItems,
  buildWorkCommandItems,
  receivableUrgency,
  sortWorkCommandItems,
  workCommandUrgency,
} from '@/lib/projects/work-command';

describe('work command summaries', () => {
  it('只列出未完成且未封存的製作任務', () => {
    const project = createProjectData('project-id', '測試專案', 'shortVideoEditing');
    project.tasks = [
      { id: 'overdue', moduleId: 'Scripting', title: '逾期片', status: '剪輯中', dueDate: '2026-09-15', amount: 0, isPaid: false, updatedAt: '2026-09-15T00:00:00.000Z' },
      { id: 'done', moduleId: 'Scripting', title: '已交付', status: '已交付', amount: 0, isPaid: false, updatedAt: '2026-09-16T00:00:00.000Z' },
      { id: 'archived', moduleId: 'Scripting', title: '已封存', status: '修改中', archivedAt: '2026-09-16T00:00:00.000Z', amount: 0, isPaid: false, updatedAt: '2026-09-16T00:00:00.000Z' },
    ];

    expect(buildWorkCommandItems(project).map((item) => item.taskId)).toEqual(['overdue']);
  });

  it('依逾期、今天、近期、未排期排序', () => {
    const items = [
      { taskId: 'future', projectId: 'p', projectName: 'p', title: 'future', status: 'x', moduleId: 'Scripting' as const, dueDate: '2026-09-25', updatedAt: '2026-09-17T00:00:00.000Z' },
      { taskId: 'none', projectId: 'p', projectName: 'p', title: 'none', status: 'x', moduleId: 'Scripting' as const, updatedAt: '2026-09-17T00:00:00.000Z' },
      { taskId: 'today', projectId: 'p', projectName: 'p', title: 'today', status: 'x', moduleId: 'Scripting' as const, dueDate: '2026-09-17', updatedAt: '2026-09-17T00:00:00.000Z' },
      { taskId: 'late', projectId: 'p', projectName: 'p', title: 'late', status: 'x', moduleId: 'Scripting' as const, dueDate: '2026-09-16', updatedAt: '2026-09-17T00:00:00.000Z' },
    ];

    expect(sortWorkCommandItems(items, '2026-09-17').map((item) => item.taskId)).toEqual(['late', 'today', 'future', 'none']);
    expect(workCommandUrgency(items[0], '2026-09-17')).toBe('upcoming');
  });
});

describe('receivable summaries', () => {
  it('月結批次是收入任務的唯一來源，不重複列入追款', () => {
    const project = createProjectData('project-id', '測試專案', 'shortVideoEditing');
    project.settlementBatches = [{
      id: 'batch-1', month: '2026-09', items: [{ taskId: 'video-1', title: '影片一', unitPrice: 1500, deliveredAt: '2026-09-10T00:00:00.000Z' }], subtotal: 1500, adjustment: 0, total: 1500, status: 'invoiced', createdAt: '2026-09-30T00:00:00.000Z', dueDate: '2026-10-15', invoiceNumber: 'INV-09',
    }];
    project.tasks = [{ id: 'income-1', moduleId: 'Finance', title: '影片一（影片收入）', status: '已請款', transactionType: 'income', amount: 1500, isPaid: false, settlementBatchId: 'batch-1', updatedAt: '2026-09-30T00:00:00.000Z' }];

    const items = buildReceivableItems(project);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'batch', amount: 1500, invoiceNumber: 'INV-09' });
    expect(receivableUrgency(items[0], '2026-10-20')).toBe('overdue');
  });

  it('未納入月結的收入仍會列出並標示未請款', () => {
    const project = createProjectData('project-id', '測試專案');
    project.tasks = [{ id: 'income-1', moduleId: 'Finance', title: '訂金', status: '待請款', transactionType: 'income', amount: 5000, isPaid: false, dueDate: '2026-09-20', updatedAt: '2026-09-17T00:00:00.000Z' }];
    expect(buildReceivableItems(project)[0]).toMatchObject({ source: 'income', amount: 5000, status: 'pending' });
    expect(receivableUrgency(buildReceivableItems(project)[0], '2026-09-17')).toBe('dueSoon');
  });
});
