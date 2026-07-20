import { describe, expect, it } from 'vitest';
import { cleanProjectData, createProjectData, DEFAULT_MODULE_CONFIGS } from '@/lib/project-data';

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
});
