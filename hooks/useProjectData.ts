import { useEffect, useState } from 'react';
import { projectApi } from '@/lib/api/project-api';
import { cleanProjectData, createProjectData } from '@/lib/project-data';
import { ModuleId, ProjectData, Task } from '@/types/project';

const financeLabels: Partial<Record<ModuleId, string>> = {
  Scripting: '腳本費',
  OnSite: '拍攝費',
  PostProduction: '剪輯費',
};

const createTaskId = () => crypto.randomUUID();

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      let localProject: ProjectData | null = null;
      const cached = localStorage.getItem(projectId);
      if (cached) {
        try {
          localProject = cleanProjectData(JSON.parse(cached), projectId);
          if (localProject && !cancelled) setProject(localProject);
        } catch {
          localStorage.removeItem(projectId);
        }
      }

      let cloudProject: ProjectData | null = null;
      try { cloudProject = await projectApi.get(projectId); } catch { /* Offline mode keeps local data. */ }

      if (!cancelled) {
        const nextProject = cloudProject ?? localProject ?? createProjectData(projectId);
        setProject(nextProject);
        localStorage.setItem(projectId, JSON.stringify(nextProject));
        setLoading(false);
      }
    }

    void loadProject();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!project || loading) return;
    const timer = window.setTimeout(async () => {
      localStorage.setItem(projectId, JSON.stringify(project));
      try {
        await projectApi.save(project);
      } catch { /* Offline mode keeps local data. */ }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [loading, project, projectId]);

  const updateProject = (updater: (current: ProjectData) => ProjectData) => {
    setProject((current) => (current ? updater(current) : current));
  };

  const addTask = (title: string, moduleId: ModuleId, status: string) => {
    updateProject((current) => {
      const taskId = createTaskId();
      const task: Task = { id: taskId, moduleId, title, status, amount: 0, isPaid: false, updatedAt: new Date().toISOString() };
      const label = financeLabels[moduleId];
      if (!label || current.isFlatRate) return { ...current, tasks: [...current.tasks, task] };

      const financeStatus = current.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses[0] ?? '📝 待請款';
      const financeTask: Task = {
        id: createTaskId(), moduleId: 'Finance', title: `${title} (${label})`, status: financeStatus,
        amount: 0, isPaid: false, linkedTaskId: taskId, updatedAt: new Date().toISOString(),
      };
      task.linkedTaskId = financeTask.id;
      return { ...current, tasks: [...current.tasks, task, financeTask] };
    });
  };

  const deleteTask = (taskId: string) => {
    updateProject((current) => {
      const linkedId = current.tasks.find((task) => task.id === taskId)?.linkedTaskId;
      return { ...current, tasks: current.tasks.filter((task) => task.id !== taskId && task.id !== linkedId) };
    });
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    updateProject((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const now = new Date().toISOString();
      let tasks = current.tasks.map((item) => item.id === taskId ? { ...item, ...updates, updatedAt: now } : item);
      const changed = tasks.find((item) => item.id === taskId)!;

      if (updates.title && changed.moduleId !== 'Finance' && changed.linkedTaskId) {
        tasks = tasks.map((item) => item.id === changed.linkedTaskId
          ? { ...item, title: `${updates.title} (${financeLabels[changed.moduleId] ?? '費用'})`, updatedAt: now }
          : item);
      }

      if (changed.moduleId === 'Finance' && updates.isPaid !== undefined) {
        const statuses = current.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses ?? [];
        tasks = tasks.map((item) => item.id !== taskId ? item : updates.isPaid
          ? { ...item, previousStatus: item.status, status: statuses.at(-1) ?? item.status, paidAt: now }
          : { ...item, status: item.previousStatus ?? statuses[0] ?? item.status, previousStatus: undefined, paidAt: undefined });
      }
      return { ...current, tasks };
    });
  };

  return { project, loading, addTask, deleteTask, updateTask };
}
