import { useState, useEffect } from 'react';
import { FilmProject, Task, ModuleId } from '../types/project';
import { AVAILABLE_MODULES } from '../constants/modules';

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<FilmProject | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const savedData = localStorage.getItem(projectId);
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      parsedData.collapsedModules = parsedData.collapsedModules || [];
      parsedData.moduleConfigs = (parsedData.moduleConfigs || []).map((c: any) => ({
        ...c,
        collapsedStatuses: c.collapsedStatuses || []
      }));
      // 預設為拆件制 (false)
      if (parsedData.isFlatRate === undefined) parsedData.isFlatRate = false;
      setProject(parsedData);
    }
  }, [projectId]);

  useEffect(() => {
    if (project && projectId) {
      localStorage.setItem(projectId, JSON.stringify(project));
    }
  }, [project, projectId]);

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

  // 雙向同步名稱對照表
  const triggerModules: Record<string, string> = {
    'Scripting': '腳本費',
    'OnSite': '拍攝費',
    'PostProduction': '剪輯費'
  };

  // 修改任務 (支援多向鏡像名稱防呆)
  const updateTask = (taskId: string, updates: Partial<Task>) => {
    if (!project) return;
    
    let updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: new Date() } : t);
    const currentTask = updatedTasks.find(t => t.id === taskId);
    
    if (currentTask) {
      // --- 名稱同步防呆引擎 ---
      if (updates.title && currentTask.linkedTaskId) {
        updatedTasks = updatedTasks.map(t => {
          if (t.id === currentTask.linkedTaskId) {
            let nextLinkedTitle = updates.title!;
            if (currentTask.moduleId === 'Finance') {
              // 從財務改名：移除所有可能的財務後綴，還原片名
              nextLinkedTitle = updates.title!
                .replace(' (腳本費)', '')
                .replace(' (拍攝費)', '')
                .replace(' (剪輯費)', '');
            } else if (triggerModules[currentTask.moduleId]) {
              // 從工作看板改名：自動補上該看板對應後綴
              nextLinkedTitle = `${updates.title} (${triggerModules[currentTask.moduleId]})`;
            }
            return { ...t, title: nextLinkedTitle, updatedAt: new Date() };
          }
          return t;
        });
      }

      // 財務跳轉
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
  
  // 新增任務 (全包判斷與全線連動)
  const addTask = (title: string, mId: ModuleId, s: string) => {
    if (!project) return;
    
    const newTaskId = crypto.randomUUID();
    const newTask: Task = { id: newTaskId, moduleId: mId, title, status: s, note: "", subTasks: [], assets: [], amount: 0, isPaid: false, updatedAt: new Date() };
    let nextTasks = [...project.tasks, newTask];
    
    // --- 核心防呆：只有在「非全包(整包)」模式下，三大看板才會自動派發帳目 ---
    if (!project.isFlatRate && triggerModules[mId]) {
      const financeConfig = project.moduleConfigs.find(c => c.moduleId === 'Finance');
      if (financeConfig && financeConfig.customStatuses.length > 0) {
        const firstFinanceStatus = financeConfig.customStatuses[0];
        const financeTaskId = crypto.randomUUID();
        const suffix = triggerModules[mId]; // 拿取 腳本費/拍攝費/剪輯費 後綴
        
        const linkedFinanceTask: Task = {
          id: financeTaskId,
          moduleId: 'Finance',
          title: `${title} (${suffix})`,
          status: firstFinanceStatus,
          note: `💡 此帳目由系統全自動防呆連動建立。連動來源：【${AVAILABLE_MODULES.find(m=>m.id===mId)?.name}】。`,
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
  
  // 刪除連帶機制
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

  return { project, addTask, deleteTask, updateTask, updateProject, addStatus, deleteStatus, toggleStatusCollapse, moveStatus };
}