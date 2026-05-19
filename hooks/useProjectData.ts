import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// 🧼 智慧格式清洗大師
function cleanProjectData(raw: any, fallbackId: string) {
  if (!raw) return null;
  let target = raw.project_data ? raw.project_data : raw;
  return {
    id: fallbackId || target.id || raw.id,
    name: target.name || target.title || target.projectName || target.project_name || raw.name || "未命名影視專案",
    isFlatRate: target.isFlatRate || false,
    tasks: Array.isArray(target.tasks) ? target.tasks : [],
    moduleConfigs: target.moduleConfigs && target.moduleConfigs.length > 0 ? target.moduleConfigs : [
      { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'] },
      { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'] },
      { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'] },
      { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'] }
    ]
  };
}

export function useProjectData(projectId: string) {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const triggerModules: Record<string, string> = {
    'Scripting': '腳本費',
    'OnSite': '拍攝費',
    'PostProduction': '剪輯費'
  };

  // 1. 🔍 讀取資料
  useEffect(() => {
    if (!projectId) return;

    async function fetchProject() {
      const localData = localStorage.getItem(projectId);
      if (localData) {
        try {
          const cleaned = cleanProjectData(JSON.parse(localData), projectId);
          if (cleaned) {
            setProject(cleaned);
            setLoading(false);
          }
        } catch (e) { console.error(e); }
      }

      try {
        const { data } = await supabase
          .from('film_projects')
          .select('project_data')
          .eq('id', projectId)
          .maybeSingle();

        if (data && data.project_data) {
          const cleaned = cleanProjectData(data.project_data, projectId);
          if (cleaned) {
            setProject(cleaned);
            localStorage.setItem(projectId, JSON.stringify(cleaned));
          }
        } else if (!localData) {
          const blank = cleanProjectData({ id: projectId }, projectId);
          setProject(blank);
          localStorage.setItem(projectId, JSON.stringify(blank));
        }
      } catch (err) {
        console.error('❌ 雲端讀取失敗:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  // 2. ⚡ 背景同步
  useEffect(() => {
    if (!project || !projectId || loading || Array.isArray(project)) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        localStorage.setItem(projectId, JSON.stringify(project));
        await supabase
          .from('film_projects')
          .upsert({
            id: projectId,
            name: project.name || '未命名專案',
            project_data: project, 
            updated_at: new Date().toISOString()
          });
      } catch (err) {
        console.error('❌ 雲端同步失敗:', err);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [project, projectId, loading]);

  // ➕ 核心連動：新增任務自動連動財務帳目
  const addTask = (title: string, moduleId: string, status: string) => {
    if (!project) return;
    const newTaskId = crypto.randomUUID();
    const newTask = {
      id: newTaskId,
      moduleId,
      title,
      status,
      note: "",
      subTasks: [],
      assets: [],
      amount: 0,
      isPaid: false,
      updatedAt: new Date()
    };
    
    let nextTasks = [...project.tasks, newTask];
    
    // 🔗 如果在製作模組新增，且不是包案，全自動防呆連動建立財務帳目
    if (!project.isFlatRate && triggerModules[moduleId]) {
      const financeConfig = project.moduleConfigs.find((c: any) => c.moduleId === 'Finance');
      const firstFinanceStatus = financeConfig?.customStatuses?.[0] || '📝 待請款';
      const financeTaskId = crypto.randomUUID();
      const suffix = triggerModules[moduleId];
      
      const linkedFinanceTask = {
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

    const updated = { ...project, tasks: nextTasks };
    setProject(updated);
    localStorage.setItem(projectId, JSON.stringify(updated));
  };

  // 🗑️ 核心連動：刪除任務，自動連動刪除對應財務項目
  const deleteTask = (id: string) => {
    if (!project) return;
    const targetTask = project.tasks.find((t: any) => t.id === id);
    let nextTasks = project.tasks.filter((t: any) => t.id !== id);
    
    // 如果有連動的任務，一起斬草除根
    if (targetTask?.linkedTaskId) {
      nextTasks = nextTasks.filter((t: any) => t.id !== targetTask.linkedTaskId);
    }
    
    const updated = { ...project, tasks: nextTasks };
    setProject(updated);
    localStorage.setItem(projectId, JSON.stringify(updated));
  };

  // ⚡ 核心連動：修改內容（標題連動對齊 + 勾選已支付自動跳轉狀態）
  const updateTask = (id: string, updates: any) => {
    if (!project) return;
    let updatedTasks = project.tasks.map((t: any) => t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t);
    const currentTask = updatedTasks.find((t: any) => t.id === id);
    
    if (currentTask) {
      // 1. 標題連動
      if (updates.title && currentTask.linkedTaskId) {
        updatedTasks = updatedTasks.map((t: any) => {
          if (t.id === currentTask.linkedTaskId) {
            let nextLinkedTitle = updates.title;
            if (currentTask.moduleId === 'Finance') {
              nextLinkedTitle = updates.title.replace(' (腳本費)', '').replace(' (拍攝費)', '').replace(' (剪輯費)', '');
            } else if (triggerModules[currentTask.moduleId]) {
              nextLinkedTitle = `${updates.title} (${triggerModules[currentTask.moduleId]})`;
            }
            return { ...t, title: nextLinkedTitle, updatedAt: new Date() };
          }
          return t;
        });
      }

      // 2. 勾選已支付 (isPaid) 全自動防呆跳轉狀態
      if (currentTask.moduleId === 'Finance' && updates.isPaid !== undefined) {
        const financeConfig = project.moduleConfigs.find((c: any) => c.moduleId === 'Finance');
        const statuses = financeConfig?.customStatuses || ['📝 待請款', '⏳ 審核中', '💰 已入帳'];
        
        if (updates.isPaid === true) {
          updatedTasks = updatedTasks.map((t: any) => t.id === id ? { 
            ...t, 
            previousStatus: t.status, 
            status: statuses[statuses.length - 1], // 強制跳轉到最後一格「已入帳」
            paidAt: new Date().toISOString()
          } : t);
        } else if (updates.isPaid === false) {
          updatedTasks = updatedTasks.map((t: any) => t.id === id ? { 
            ...t, 
            status: t.previousStatus || statuses[0], // 退回之前的狀態
            previousStatus: undefined,
            paidAt: undefined 
          } : t);
        }
      }
    }

    const updated = { ...project, tasks: updatedTasks };
    setProject(updated);
    localStorage.setItem(projectId, JSON.stringify(updated));
  };

  return { project, loading, addTask, deleteTask, updateTask };
}