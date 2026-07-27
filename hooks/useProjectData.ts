import { useCallback, useEffect, useRef, useState } from 'react';
import { projectApi } from '@/lib/client/project-api';
import { cleanProjectData, createProjectData, switchProjectTemplate } from '@/lib/project-data';
import { addTaskToProject, deleteTaskFromProject, updateTaskInProject } from '@/lib/projects/task-logic';
import { ModuleId, MonthlySettlement, ProjectData, ProjectType, Task, TransactionType } from '@/types/project';

export type SyncStatus = 'syncing' | 'synced' | 'error' | 'conflict';

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncVersion = useRef<string | null>(null);

  const syncProject = useCallback(async (projectToSync: ProjectData) => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const saved = await projectApi.save({ ...projectToSync, syncVersion: syncVersion.current ?? undefined });
      syncVersion.current = saved.syncVersion ?? null;
      localStorage.setItem(projectToSync.id, JSON.stringify(saved));
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('synced');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失敗';
      setSyncError(message);
      setSyncStatus(message.includes('同步衝突') ? 'conflict' : 'error');
      return false;
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
        syncVersion.current = nextProject.syncVersion ?? null;
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

  const resolveConflict = async (choice: 'cloud' | 'local') => {
    if (!project) return;
    try {
      const cloud = await projectApi.get(projectId);
      if (!cloud) {
        syncVersion.current = null;
        await syncProject(project);
        return;
      }
      syncVersion.current = cloud.syncVersion ?? null;
      if (choice === 'cloud') {
        setProject(cloud);
        localStorage.setItem(projectId, JSON.stringify(cloud));
        setSyncError(null);
        setSyncStatus('synced');
        setLastSyncedAt(new Date().toISOString());
      } else {
        await syncProject(project);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : '衝突處理失敗');
      setSyncStatus('error');
    }
  };

  const renameProject = (name: string) => {
    const nextName = name.trim();
    if (!nextName) return false;
    updateProject((current) => ({ ...current, name: nextName }));
    return true;
  };

  const updateBudget = (amount: number) => {
    updateProject((current) => ({ ...current, budgetAmount: Math.max(0, amount) }));
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

  return { project, loading, syncStatus, syncError, lastSyncedAt, retrySync, resolveConflict, renameProject, updateBudget, addMonthlySettlement, updateMonthlySettlement, deleteMonthlySettlement, updateProjectTemplate, addTask, deleteTask, updateTask };
}
