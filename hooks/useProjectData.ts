import { useCallback, useEffect, useState } from 'react';
import { projectApi } from '@/lib/client/project-api';
import { cleanProjectData, createProjectData, switchProjectTemplate } from '@/lib/project-data';
import { addTaskToProject, deleteTaskFromProject, updateTaskInProject } from '@/lib/projects/task-logic';
import { ExpenseCategory, ModuleId, MonthlySettlement, ProjectData, ProjectType, Task, TransactionType } from '@/types/project';

export type SyncStatus = 'syncing' | 'synced' | 'error';

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const syncProject = useCallback(async (projectToSync: ProjectData) => {
    setSyncStatus('syncing');
    try {
      await projectApi.save(projectToSync);
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }, []);

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
      let cloudLoaded = false;
      try {
        cloudProject = await projectApi.get(projectId);
        cloudLoaded = true;
      } catch { /* Offline mode keeps local data. */ }

      if (!cancelled) {
        const nextProject = cloudProject ?? localProject ?? createProjectData(projectId);
        setProject(nextProject);
        localStorage.setItem(projectId, JSON.stringify(nextProject));
        if (cloudLoaded) {
          setLastSyncedAt(new Date().toISOString());
          setSyncStatus('synced');
        } else {
          setSyncStatus('error');
        }
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
      await syncProject(project);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [loading, project, projectId, syncProject]);

  const updateProject = (updater: (current: ProjectData) => ProjectData) => {
    setSyncStatus('syncing');
    setProject((current) => (current ? updater(current) : current));
  };

  const retrySync = async () => {
    if (!project) return;
    localStorage.setItem(projectId, JSON.stringify(project));
    await syncProject(project);
  };

  const renameProject = (name: string) => {
    const nextName = name.trim();
    if (!nextName) return false;
    updateProject((current) => ({ ...current, name: nextName }));
    return true;
  };

  const updateBudget = (category: ExpenseCategory, amount: number) => {
    updateProject((current) => ({
      ...current,
      budgetByCategory: { ...current.budgetByCategory, [category]: Math.max(0, amount) },
    }));
  };

  const addMonthlySettlement = () => {
    updateProject((current) => ({ ...current, monthlySettlements: [...current.monthlySettlements, { id: crypto.randomUUID(), month: new Date().toISOString().slice(0, 7), deliveredCount: 0, unitPrice: 0, status: 'pending' }] }));
  };

  const updateMonthlySettlement = (id: string, updates: Partial<MonthlySettlement>) => {
    updateProject((current) => ({ ...current, monthlySettlements: current.monthlySettlements.map((settlement) => settlement.id === id ? { ...settlement, ...updates } : settlement) }));
  };

  const deleteMonthlySettlement = (id: string) => {
    updateProject((current) => ({ ...current, monthlySettlements: current.monthlySettlements.filter((settlement) => settlement.id !== id) }));
  };

  const updateProjectTemplate = (projectType: ProjectType) => {
    updateProject((current) => switchProjectTemplate(current, projectType));
  };

  const addTask = (title: string, moduleId: ModuleId, status: string, transactionType?: TransactionType, transactionAmount?: number, linkedIncomeAmount?: number) => {
    updateProject((current) => addTaskToProject(current, title, moduleId, status, transactionType, transactionAmount, linkedIncomeAmount));
  };

  const deleteTask = (taskId: string) => {
    updateProject((current) => deleteTaskFromProject(current, taskId));
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    updateProject((current) => updateTaskInProject(current, taskId, updates));
  };

  return { project, loading, syncStatus, lastSyncedAt, retrySync, renameProject, updateBudget, addMonthlySettlement, updateMonthlySettlement, deleteMonthlySettlement, updateProjectTemplate, addTask, deleteTask, updateTask };
}
