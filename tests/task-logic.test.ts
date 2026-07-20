import { describe, expect, it } from 'vitest';
import { createProjectData } from '@/lib/project-data';
import { updateTaskInProject } from '@/lib/projects/task-logic';

describe('任務邏輯', () => {
  it('財務任務移至已入帳時會標示為已支付', () => {
    const project = createProjectData('project-id');
    const financeStatus = project.moduleConfigs.find((config) => config.moduleId === 'Finance')!.customStatuses;
    const original = {
      id: 'finance-task', moduleId: 'Finance' as const, title: '拍攝費', status: financeStatus[0],
      amount: 1000, isPaid: false, updatedAt: new Date().toISOString(),
    };

    const updated = updateTaskInProject({ ...project, tasks: [original] }, original.id, { status: financeStatus.at(-1) });

    expect(updated.tasks[0]).toMatchObject({ isPaid: true, status: financeStatus.at(-1) });
    expect(updated.tasks[0].paidAt).toBeTruthy();
  });
});
