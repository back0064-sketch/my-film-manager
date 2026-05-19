import { useState, useEffect } from 'react';
import { FilmProject, Task } from '../types/project';
import { ModuleId } from '../constants/modules';
import { supabase } from '@/lib/supabase';

// 💡 預設初始範本（當本地與雲端都完全沒有任何資料時才啟動）
const DEFAULT_PROJECT_TEMPLATE: any = {
  name: "全新影視專案",
  isFlatRate: false,
  tasks: [],
  moduleConfigs: [
    { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'], collapsedStatuses: [] },
    { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'], collapsedStatuses: [] },
    { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'], collapsedStatuses: [] },
    { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'], collapsedStatuses: [] }
  ]
};

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<FilmProject | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. 🔍 讀取資料：本地快取優先，拒絕空白！
  useEffect(() => {
    if (!projectId) return;

    async function fetchProject() {
      setLoading(true);
      
      // 🛟 雙保險 A：第一時間先撈瀏覽器本地快取，保證網頁秒開、不空白、名字不被洗掉
      const localData = localStorage.getItem(projectId);
      if (localData) {
        setProject(JSON.parse(localData));
      }

      try {
        // ☁️ 雙保險 B：去雲端撈最新資料
        const { data, error } = await supabase
          .from('film_projects')
          .select('project_data')
          .eq('id', projectId)
          .maybeSingle();

        if (error) {
          console.error('⚠️ [Supabase 雲端讀取管制]：', error.message);
          // 如果連本地快取都沒有，才使用乾淨的預設範本
          if (!localData) {
            setProject({ ...DEFAULT_PROJECT_TEMPLATE, id: projectId } as any);
          }
        } else if (data && data.project_data) {
          // ☁️ 雲端有最新資料，覆蓋本地並更新
          const parsedData = data.project_data as any;
          parsedData.collapsedModules = parsedData.collapsedModules || [];
          parsedData.moduleConfigs = (parsedData.moduleConfigs || []).map((c: any) => ({
            ...c,
            collapsedStatuses: c.collapsedStatuses || []
          }));
          if (parsedData.isFlatRate === undefined) parsedData.isFlatRate = false;
          
          setProject(parsedData);
          localStorage.setItem(projectId, JSON.stringify(parsedData));
        } else {
          // 雲端完全沒這筆資料（代表是新建立的），若本地沒快取才初始化
          if (!localData) {
            setProject({ ...DEFAULT_PROJECT_TEMPLATE, id: projectId } as any);
          }
        }
      } catch (err) {
        console.error('❌ 讀取例外錯誤:', err);
        if (!localData) setProject(DEFAULT_PROJECT_TEMPLATE);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  // 2. ⚡ 自動秒同步：先鎖死本地防丟，再背景推送雲端
  useEffect(() => {
    if (!project || !projectId || loading) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        // 💾 絕對優先存入本地，保證你剛剛修改的資料一定被存下來！
        localStorage.setItem(projectId, JSON.stringify(project));

        // ☁️ 背景嘗試推上雲端大腦
        const { error } = await supabase
          .from('film_projects')
          .upsert({
            id: projectId,
            name: (project as any).name || '未命名專案',
            project_data: project as any,
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.error('⚠️ [Supabase 雲端寫入管制]：資料已安全存在本地，但雲端同步失敗，請檢查資料庫 RLS 權限。原因：', error.message);
        } else {
          console.log('☁️ [Supabase] 雲端即時同步備份大成功！');
        }
      } catch (err) {
        console.error('❌ 同步例外錯誤:', err);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [project, projectId, loading]);

  // -------------------------------------------------------------
  // 以下為核心防呆連動邏輯（完美保留）
  // -------------------------------------------------------------
  const updateProject = (u: any) => {
    setProject((prev) => {
      const next = prev ? { ...prev, ...u } : u;
      localStorage.setItem(projectId, JSON.stringify(next)); // 強制同步本地
      return next;
    });
  };

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