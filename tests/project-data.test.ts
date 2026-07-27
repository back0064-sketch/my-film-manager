import { describe, expect, it } from 'vitest';
import { cleanProjectData, createProjectData, DEFAULT_MODULE_CONFIGS, switchProjectTemplate } from '@/lib/project-data';

describe('專案資料', () => {
  it('建立專案時會套用預設模組設定', () => {
    const project = createProjectData('project-id', '測試專案');

    expect(project).toMatchObject({
      id: 'project-id',
      name: '測試專案',
      tasks: [],
      moduleConfigs: DEFAULT_MODULE_CONFIGS,
    });
  });

  it('清理資料時保留有效任務並排除無效任務', () => {
    const project = cleanProjectData({
      project_data: {
        name: '  雲端專案  ',
        tasks: [
          { id: 'task-1', moduleId: 'Scripting', title: '完成大綱', status: '💡 構想中' },
          { id: 'task-2', moduleId: 'Unknown', title: '無效任務', status: '未分類' },
        ],
      },
    }, 'fallback-id');

    expect(project).toMatchObject({
      id: 'fallback-id',
      name: '  雲端專案  ',
      tasks: [{
        id: 'task-1',
        moduleId: 'Scripting',
        title: '完成大綱',
        amount: 0,
        isPaid: false,
      }],
    });
  });

  it('會將舊版單筆月結遷移為收入項目', () => {
    const project = cleanProjectData({ name: '短影音', projectType: 'shortVideoEditing', monthlySettlement: { month: '2026-07', deliveredCount: 12, unitPrice: 800, status: 'invoiced' } }, 'short-id');

    expect(project?.monthlySettlements).toEqual([]);
    expect(project?.tasks.find((task) => task.transactionType === 'income')).toMatchObject({ amount: 9600, transactionDate: '2026-07-01', title: '2026-07 短影音月結（舊資料）' });
  });

  it('會將舊版分類預算加總為專案總預算', () => {
    const project = cleanProjectData({
      name: '舊預算專案',
      budgetByCategory: { Scripting: 1000, OnSite: 2000, PostProduction: 3000 },
    }, 'legacy-budget-id');

    expect(project?.budgetAmount).toBe(6000);
  });

  it('切換模板會保留任務並把舊板塊任務移到主流程', () => {
    const project = createProjectData('project-id', '測試專案');
    const switched = switchProjectTemplate({ ...project, tasks: [{ id: 'old-task', moduleId: 'OnSite', title: '舊任務', status: '🎬 拍攝中', amount: 0, isPaid: false, updatedAt: '2026-07-21T00:00:00.000Z' }] }, 'longVideoEditing');

    expect(switched.tasks[0]).toMatchObject({ moduleId: 'Scripting', status: '素材整理' });
  });
});
