import { describe, expect, it } from 'vitest';
import { createProjectData } from '@/lib/project-data';
import { addTaskToProject, deleteTaskFromProject, updateTaskInProject } from '@/lib/projects/task-logic';

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

  it('一般製作任務會連動建立支出財務項目', () => {
    const project = createProjectData('project-id');
    const updated = addTaskToProject(project, '完成剪輯', 'Scripting', '💡 構想中');

    expect(updated.tasks.find((task) => task.moduleId === 'Finance')).toMatchObject({ transactionType: 'expense', title: '完成剪輯 (製作費)' });
  });

  it('短影音任務填寫單支收入時會連動建立收入項目', () => {
    const project = createProjectData('short-project', '短影音', 'shortVideoEditing');
    const updated = addTaskToProject(project, '第 1 支短影音', 'Scripting', '待收素材', 'income', 1000);

    expect(updated.tasks).toHaveLength(2);
    expect(updated.tasks.find((task) => task.moduleId === 'Finance')).toMatchObject({ transactionType: 'income', amount: 1000, title: '第 1 支短影音 (影片收入)' });
  });

  it('從財務頁手動新增收入時會保留收入類型', () => {
    const project = createProjectData('project-id');
    const financeStatus = project.moduleConfigs.find((config) => config.moduleId === 'Finance')!.customStatuses[0];
    const updated = addTaskToProject(project, '專案尾款', 'Finance', financeStatus, 'income');

    expect(updated.tasks).toHaveLength(1);
    expect(updated.tasks[0]).toMatchObject({
      moduleId: 'Finance',
      title: '專案尾款',
      transactionType: 'income',
      amount: 0,
      isPaid: false,
    });
    expect(updated.tasks[0].transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('短影音任務移至已交付時，連動收入會標示可收款', () => {
    const project = createProjectData('short-project', '短影音', 'shortVideoEditing');
    const created = addTaskToProject(project, '第 1 支短影音', 'Scripting', '待收素材', 'income', 1000);
    const task = created.tasks.find((item) => item.moduleId === 'Scripting')!;
    const updated = updateTaskInProject(created, task.id, { status: '已交付' });

    expect(updated.tasks.find((item) => item.moduleId === 'Finance')).toMatchObject({ readyForCollection: true, isPaid: false });
  });

  it('舊資料只有製作任務指向收入時，移至已交付仍會標示可收款', () => {
    const project = createProjectData('legacy-short-project', '舊短影音', 'shortVideoEditing');
    project.tasks = [
      {
        id: 'production-task',
        moduleId: 'Scripting',
        title: '舊版短影音',
        status: '待收素材',
        amount: 0,
        isPaid: false,
        linkedTaskId: 'income-task',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'income-task',
        moduleId: 'Finance',
        title: '舊版短影音 (影片收入)',
        status: '📝 待請款',
        amount: 1000,
        isPaid: false,
        transactionType: 'income',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ];

    const updated = updateTaskInProject(project, 'production-task', { status: '已交付' });

    expect(updated.tasks.find((item) => item.id === 'income-task')).toMatchObject({
      readyForCollection: true,
      isPaid: false,
    });
  });

  it('節目企劃任務填寫收入時會同時保留連動支出', () => {
    const project = createProjectData('program-project', '節目企劃', 'programPlanning');
    const updated = addTaskToProject(project, '完成田調', 'Scripting', '田調中', undefined, undefined, 5000);

    expect(updated.tasks.filter((task) => task.moduleId === 'Finance')).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionType: 'expense' }),
      expect.objectContaining({ transactionType: 'income', amount: 5000 }),
    ]));
  });

  it('從財務頁刪除連動交易時會保留原製作任務與其他交易', () => {
    const project = createProjectData('program-project', '節目企劃', 'programPlanning');
    const created = addTaskToProject(project, '完成田調', 'Scripting', '田調中', undefined, undefined, 5000);
    const productionTask = created.tasks.find((task) => task.moduleId === 'Scripting')!;
    const incomeTask = created.tasks.find((task) => task.transactionType === 'income')!;
    const expenseTask = created.tasks.find((task) => task.transactionType === 'expense')!;

    const updated = deleteTaskFromProject(created, incomeTask.id);

    expect(updated.tasks.map((task) => task.id)).toEqual(expect.arrayContaining([productionTask.id, expenseTask.id]));
    expect(updated.tasks.some((task) => task.id === incomeTask.id)).toBe(false);
  });

  it('刪除製作任務時會刪除其全部連動收支', () => {
    const project = createProjectData('program-project', '節目企劃', 'programPlanning');
    const created = addTaskToProject(project, '完成田調', 'Scripting', '田調中', undefined, undefined, 5000);
    const productionTask = created.tasks.find((task) => task.moduleId === 'Scripting')!;

    const updated = deleteTaskFromProject(created, productionTask.id);

    expect(updated.tasks).toEqual([]);
  });
});
