import { ModuleId, ProjectData, Task } from '@/types/project';

const financeLabels: Partial<Record<ModuleId, string>> = {
  Scripting: '製作費',
  OnSite: '拍攝費',
  PostProduction: '剪輯費',
};

const createTaskId = () => crypto.randomUUID();

export function addTaskToProject(project: ProjectData, title: string, moduleId: ModuleId, status: string, transactionType?: 'income' | 'expense', transactionAmount?: number, linkedIncomeAmount?: number): ProjectData {
  const taskId = createTaskId();
  const task: Task = { id: taskId, moduleId, title, status, amount: 0, isPaid: false, updatedAt: new Date().toISOString() };
  const label = financeLabels[moduleId];
  if (!label) {
    if (moduleId !== 'Finance') return { ...project, tasks: [...project.tasks, task] };
    const type = transactionType ?? 'expense';
    const financeTask: Task = {
      ...task,
      transactionType: type,
      amount: Math.max(0, transactionAmount ?? 0),
      transactionDate: type === 'income' ? new Date().toISOString().slice(0, 10) : undefined,
    };
    return { ...project, tasks: [...project.tasks, financeTask] };
  }

  if (project.isFlatRate && transactionAmount === undefined) return { ...project, tasks: [...project.tasks, task] };

  const financeStatus = project.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses[0] ?? '📝 待請款';
  const createFinanceTask = (type: 'income' | 'expense', amount: number, suffix: string): Task => ({ id: createTaskId(), moduleId: 'Finance', title: `${title} (${suffix})`, status: financeStatus, amount: Math.max(0, amount), isPaid: false, transactionType: type, transactionDate: type === 'income' ? new Date().toISOString().slice(0, 10) : undefined, linkedTaskId: taskId, updatedAt: new Date().toISOString() });
  if (project.isFlatRate) {
    const income = createFinanceTask('income', transactionAmount ?? 0, '影片收入');
    task.linkedTaskId = income.id;
    return { ...project, tasks: [...project.tasks, task, income] };
  }
  const expense = createFinanceTask('expense', 0, label);
  const income = linkedIncomeAmount === undefined ? [] : [createFinanceTask('income', linkedIncomeAmount, '任務收入')];
  task.linkedTaskId = expense.id;
  return { ...project, tasks: [...project.tasks, task, expense, ...income] };
}

export function deleteTaskFromProject(project: ProjectData, taskId: string): ProjectData {
  const task = project.tasks.find((item) => item.id === taskId);
  if (!task) return project;
  if (task.moduleId === 'Finance') {
    return { ...project, tasks: project.tasks.filter((item) => item.id !== taskId) };
  }
  const linkedFinanceIds = new Set(
    project.tasks
      .filter((item) => item.moduleId === 'Finance' && (item.linkedTaskId === taskId || item.id === task.linkedTaskId))
      .map((item) => item.id),
  );
  return { ...project, tasks: project.tasks.filter((item) => item.id !== taskId && !linkedFinanceIds.has(item.id)) };
}

export function updateTaskInProject(project: ProjectData, taskId: string, updates: Partial<Task>): ProjectData {
  const task = project.tasks.find((item) => item.id === taskId);
  if (!task) return project;

  const now = new Date().toISOString();
  let tasks = project.tasks.map((item) => item.id === taskId ? { ...item, ...updates, updatedAt: now } : item);
  const changed = tasks.find((item) => item.id === taskId)!;

  if (updates.title && changed.moduleId !== 'Finance') {
    tasks = tasks.map((item) => item.linkedTaskId === changed.id
      ? { ...item, title: `${updates.title} (${item.transactionType === 'income' ? '任務收入' : financeLabels[changed.moduleId] ?? '費用'})`, updatedAt: now }
      : item);
  }

  if (changed.moduleId !== 'Finance' && updates.status !== undefined) {
    const finalStatus = project.moduleConfigs.find((config) => config.moduleId === changed.moduleId)?.customStatuses.at(-1);
    tasks = tasks.map((item) => item.linkedTaskId === changed.id && item.transactionType === 'income'
      ? { ...item, readyForCollection: changed.status === finalStatus, updatedAt: now }
      : item);
  }

  if (changed.moduleId === 'Finance' && updates.status !== undefined && updates.isPaid === undefined) {
    const statuses = project.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses ?? [];
    const isPaid = updates.status === statuses.at(-1);
    tasks = tasks.map((item) => item.id !== taskId ? item : {
      ...item,
      isPaid,
      previousStatus: isPaid ? task.status : undefined,
      paidAt: isPaid ? now : undefined,
    });
  }

  if (changed.moduleId === 'Finance' && updates.isPaid !== undefined) {
    const statuses = project.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses ?? [];
    tasks = tasks.map((item) => item.id !== taskId ? item : updates.isPaid
      ? { ...item, previousStatus: item.status, status: statuses.at(-1) ?? item.status, paidAt: now }
      : { ...item, status: item.previousStatus ?? statuses[0] ?? item.status, previousStatus: undefined, paidAt: undefined });
  }
  return { ...project, tasks };
}
