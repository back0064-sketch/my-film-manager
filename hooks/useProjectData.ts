import { useState, useEffect } from 'react';
import { FilmProject, Task } from '../types/project';
import { AVAILABLE_MODULES, ModuleId } from '../constants/modules';
import { supabase } from '../lib/supabase'; // 🔌 引入雲端大腦連線

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<FilmProject | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // 雲端讀取狀態

  // 1. 🔍 從雲端 Supabase 讀取資料
  useEffect(() => {
    if (!projectId) return;

    async function fetchProjectFromCloud() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('film_projects')
          .select('project_data')
          .eq('id', projectId)
          .single();

        if (error) {
          console.log('💡 雲端尚無此專案，嘗試讀取本地瀏覽器過渡...', error.message);
          // 雲端沒有就讀本地
          const savedData = localStorage.getItem(projectId);
          if (savedData) {
            setProject(JSON.parse(savedData));
          }
        } else if (data && data.project_data) {
          // ☁️ 成功撈到雲端大腦資料，加上 as any 破解 TypeScript 嚴格檢查！
          const parsedData = data.project_data as any;
          parsedData.collapsedModules = parsedData.collapsedModules || [];
          parsedData.moduleConfigs = (parsedData.moduleConfigs || []).map((c: any) => ({
            ...c,
            collapsedStatuses: c.collapsedStatuses || []
          }));
          if (parsedData.isFlatRate === undefined) parsedData.isFlatRate = false;
          setProject(parsedData);
        }
      } catch (err) {
        console.error('❌ 讀取雲端失敗:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProjectFromCloud();
  }, [projectId]);

  // 2. ⚡ 當資料有任何變動，自動「秒同步」推上雲端（內建 0.5 秒防抖）
  useEffect(() => {
    if (!project || !projectId || loading) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        // 同步寫入本地與雲端（雙保險防丟機制）
        localStorage.setItem(projectId, JSON.stringify(project));

        await supabase
          .from('film_projects')
          .upsert({
            id: projectId,
            nname: (project as any).name || '未命名專案',
            project_data: project as any, // 💡 加上 as any 順利通過雲端打包優化
            updated_at: new Date().toISOString()
          });
        console.log('☁️ [Supabase] 雲端即時同步成功！');
      } catch (err) {
        console.error('❌ 雲端同步失敗:', err);
      }
    }, 500); // 停手 0.5 秒後才發送，極致流暢

    return () => clearTimeout(delayDebounceFn);
  }, [project, projectId, loading]);

  // -------------------------------------------------------------
  // 以下為原本強大的三大模組防呆連動邏輯（核心完全不變，完美承接）
  // -------------------------------------------------------------
  const moveStatus = (mId: ModuleId, statusName: string, direction: 'up' | 'down') => {
    if (!project) return;
    const newConfigs = project.moduleConfigs.map(c => {
      if (c.moduleId === mId) {
        const list = [...c.customStatuses];
        const idx = list.indexOf(statusName);
        if (direction === 'up' && idx > 0) [list[idx-1], list[idx]] = [list[idx], list[idx-1]];
        if (direction === 'down' && idx < list.length - 1) [list[idx+1], list[idx]] = [list[idx], list[idx+1]];
        return { ...c, customStatuses: list };
      }
      return c;
    });
    setProject({ ...project, moduleConfigs: newConfigs });
  };

  const triggerModules: Record<string, string> = {
    'Scripting': '腳本費',
    'OnSite': '拍攝費',
    'PostProduction': '剪輯費'
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    if (!project) return;
    let updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: new Date() } : t);
    const currentTask = updatedTasks.find(t => t.id === taskId);
    
    if (currentTask) {
      if (updates.title && currentTask.linkedTaskId) {
        updatedTasks = updatedTasks.map(t => {
          if (t.id === currentTask.linkedTaskId) {
            let nextLinkedTitle = updates.title!;
            if (currentTask.moduleId === 'Finance') {
              nextLinkedTitle = updates.title!
                .replace(' (腳本費)', '')
                .replace(' (拍攝費)', '')
                .replace(' (剪輯費)', '');
            } else if (triggerModules[currentTask.moduleId]) {
              nextLinkedTitle = `${updates.title} (${triggerModules[currentTask.moduleId]})`;
            }
            return { ...t, title: nextLinkedTitle, updatedAt: new Date() };
          }
          return t;
        });
      }

      if (currentTask.moduleId === 'Finance') {
        const config = project.moduleConfigs.find(c => c.moduleId === 'Finance');
        const statuses = config?.customStatuses || [];
        if (statuses.length > 0) {
          if (updates.isPaid === true) {
            updatedTasks = updatedTasks.map(t => t.id === taskId ? { 
              ...t, 
              previousStatus: t.status, 
              status: statuses[statuses.length-1],
              paidAt: t.paidAt || new Date().toISOString()
            } : t);
          } else if (updates.isPaid === false) {
            updatedTasks = updatedTasks.map(t => t.id === taskId ? { 
              ...t, 
              status: t.previousStatus || statuses[0], 
              previousStatus: undefined,
              paidAt: undefined 
            } : t);
          }
        }
      }
    }
    setProject({ ...project, tasks: updatedTasks });
  };

  const updateProject = (u: Partial<FilmProject>) => project && setProject({ ...project, ...u });
  
  const addTask = (title: string, mId: ModuleId, s: string) => {
    if (!project) return;
    const newTaskId = crypto.randomUUID();
    const newTask: Task = { id: newTaskId, moduleId: mId, title, status: s, note: "", subTasks: [], assets: [], amount: 0, isPaid: false, updatedAt: new Date() };
    let nextTasks = [...project.tasks, newTask];
    
    if (!project.isFlatRate && triggerModules[mId]) {
      const financeConfig = project.moduleConfigs.find(c => c.moduleId === 'Finance');
      if (financeConfig && financeConfig.customStatuses.length > 0) {
        const firstFinanceStatus = financeConfig.customStatuses[0];
        const financeTaskId = crypto.randomUUID();
        const suffix = triggerModules[mId];
        
        const linkedFinanceTask: Task = {
          id: financeTaskId,
          moduleId: 'Finance',
          title: `${title} (${suffix})`,
          status: firstFinanceStatus,
          note: `💡 此帳目由系統全自動防呆連動建立。`,
          subTasks: [],
          assets: [],
          amount: 0,
          isPaid: false,
          linkedTaskId: newTaskId,
          updatedAt: new Date()
        };
        newTask.linkedTaskId = financeTaskId;
        nextTasks.push(linkedFinanceTask);
      }
    }
    setProject({ ...project, tasks: nextTasks });
  };
  
  const deleteTask = (id: string) => {
    if (!project) return;
    const targetTask = project.tasks.find(t => t.id === id);
    let nextTasks = project.tasks.filter(t => t.id !== id);
    if (targetTask?.linkedTaskId) {
      nextTasks = nextTasks.filter(t => t.id !== targetTask.linkedTaskId);
    }
    setProject({ ...project, tasks: nextTasks });
  };
  
  const addStatus = (mId: ModuleId, name: string) => {
    if (!project) return;
    const newConfigs = project.moduleConfigs.map(c => c.moduleId === mId ? { ...c, customStatuses: [...c.customStatuses, name] } : c);
    setProject({ ...project, moduleConfigs: newConfigs });
  };
  const deleteStatus = (mId: ModuleId, name: string) => {
    if (!project) return;
    const newConfigs = project.moduleConfigs.map(c => c.moduleId === mId ? { ...c, customStatuses: c.customStatuses.filter(s => s !== name) } : c);
    setProject({ ...project, moduleConfigs: newConfigs, tasks: project.tasks.filter(t => !(t.moduleId === mId && t.status === name)) });
  };
  const toggleStatusCollapse = (mId: ModuleId, s: string) => {
    if (!project) return;
    const newConfigs = project.moduleConfigs.map(c => {
      if (c.moduleId === mId) {
        const list = c.collapsedStatuses || [];
        return { ...c, collapsedStatuses: list.includes(s) ? list.filter(x => x !== s) : [...list, s] };
      }
      return c;
    });
    setProject({ ...project, moduleConfigs: newConfigs });
  };

  return { project, loading, addTask, deleteTask, updateTask, updateProject, addStatus, deleteStatus, toggleStatusCollapse, moveStatus };
}