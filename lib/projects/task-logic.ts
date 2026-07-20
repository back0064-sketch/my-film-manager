import { ExpenseCategory, ModuleId, ProjectData, Task } from '@/types/project';

const financeLabels: Partial<Record<ModuleId, string>> = {
  Scripting: '腳本費',
  OnSite: '拍攝費',
  PostProduction: '剪輯費',
};

const createTaskId = () => crypto.randomUUID();

export function addTaskToProject(project: ProjectData, title: string, moduleId: ModuleId, status: string): ProjectData {
  const taskId = createTaskId();
  const task: Task = { id: taskId, moduleId, title, status, amount: 0, isPaid: false, updatedAt: new Date().toISOString() };
  const label = financeLabels[moduleId];
  if (!label || project.isFlatRate) return { ...project, tasks: [...project.tasks, task] };

  const financeStatus = project.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses[0] ?? '📝 待請款';
  const financeTask: Task = {
    id: createTaskId(), moduleId: 'Finance', title: `${title} (${label})`, status: financeStatus,
    amount: 0, isPaid: false, linkedTaskId: taskId, expenseCategory: moduleId as ExpenseCategory, updatedAt: new Date().toISOString(),
  };
  task.linkedTaskId = financeTask.id;
  return { ...project, tasks: [...project.tasks, task, financeTask] };
}

export function deleteTaskFromProject(project: ProjectData, taskId: string): ProjectData {
  const linkedId = project.tasks.find((task) => task.id === taskId)?.linkedTaskId;
  return { ...project, tasks: project.tasks.filter((task) => task.id !== taskId && task.id !== linkedId) };
}

export function updateTaskInProject(project: ProjectData, taskId: string, updates: Partial<Task>): ProjectData {
  const task = project.tasks.find((item) => item.id === taskId);
  if (!task) return project;

  const now = new Date().toISOString();
  let tasks = project.tasks.map((item) => item.id === taskId ? { ...item, ...updates, updatedAt: now } : item);
  const changed = tasks.find((item) => item.id === taskId)!;

  if (updates.title && changed.moduleId !== 'Finance' && changed.linkedTaskId) {
    tasks = tasks.map((item) => item.id === changed.linkedTaskId
      ? { ...item, title: `${updates.title} (${financeLabels[changed.moduleId] ?? '費用'})`, updatedAt: now }
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
