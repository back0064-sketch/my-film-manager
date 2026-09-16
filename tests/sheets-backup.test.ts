import { describe, expect, it } from 'vitest';
import { buildBackupWorkbook } from '@/lib/backups/sheets-data';

describe('Google 試算表備份資料', () => {
  it('把專案內的任務與月結資料展開成獨立分頁', () => {
    const workbook = buildBackupWorkbook([
      {
        id: 'project-1',
        name: '形象影片',
        owner_id: 'owner-1',
        client_id: 'client-1',
        updated_at: '2026-09-16T10:00:00.000Z',
        project_data: {
          id: 'project-1',
          name: '形象影片',
          projectType: 'general',
          isFlatRate: true,
          budgetAmount: 120000,
          moduleConfigs: [],
          tasks: [{ id: 'task-1', moduleId: 'Scripting', title: '完成腳本', status: '進行中', amount: 30000, isPaid: false, updatedAt: '2026-09-16' }],
          monthlySettlements: [{ id: 'settlement-1', month: '2026-09', deliveredCount: 3, unitPrice: 5000, status: 'pending' }],
        },
      },
    ], [
      {
        id: 'client-1', owner_id: 'owner-1', name: '測試客戶', contact_name: null, contact_email: null,
        contact_phone: null, notes: null, created_at: '2026-09-01', updated_at: '2026-09-16',
      },
    ], '2026/9/16 下午6:00:00');

    expect(workbook.projects[1]).toEqual(expect.arrayContaining(['project-1', '形象影片', '測試客戶', 120000]));
    expect(workbook.tasks[1]).toEqual(expect.arrayContaining(['task-1', '完成腳本', '進行中', 30000, '否']));
    expect(workbook.settlements[1]).toEqual(expect.arrayContaining(['settlement-1', '2026-09', 3, 5000, 'pending']));
    expect(workbook.status).toContainEqual(['任務筆數', 1]);
  });

  it('保留舊版單筆月結資料', () => {
    const workbook = buildBackupWorkbook([
      {
        id: 'legacy', name: '舊案', owner_id: 'owner-1', client_id: null, updated_at: '2026-09-16',
        project_data: {
          id: 'legacy', name: '舊案', projectType: 'shortVideoEditing', isFlatRate: false, budgetAmount: 0,
          moduleConfigs: [], tasks: [], monthlySettlements: [],
          monthlySettlement: { id: 'old-1', month: '2026-08', deliveredCount: 1, unitPrice: 3000, status: 'paid' },
        },
      },
    ], [], '現在');

    expect(workbook.settlements).toHaveLength(2);
    expect(workbook.settlements[1]).toEqual(expect.arrayContaining(['old-1', '2026-08', 'paid']));
  });
});
