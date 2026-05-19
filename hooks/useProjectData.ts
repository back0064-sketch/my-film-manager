import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// 🧼 格式自動解包大師：不管是雲端撈的、本地存的、還是舊JSON，一律拆包裝成最乾淨的看板格式
function cleanProjectData(raw: any) {
  if (!raw) return null;
  let target = raw.project_data ? raw.project_data : raw;
  return {
    id: target.id || raw.id,
    name: target.name || raw.name || "未命名專案",
    isFlatRate: target.isFlatRate || false,
    tasks: target.tasks || [],
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

  // 1. 🔍 讀取資料：秒開快取優先
  useEffect(() => {
    if (!projectId) return;

    async function fetchProject() {
      const localData = localStorage.getItem(projectId);
      if (localData) {
        try {
          const cleaned = cleanProjectData(JSON.parse(localData));
          if (cleaned) {
            setProject(cleaned);
            setLoading(false); // 本地有資料就秒開畫面！
          }
        } catch (e) { console.error(e); }
      } else {
        setLoading(true);
      }

      try {
        const { data } = await supabase
          .from('film_projects')
          .select('project_data')
          .eq('id', projectId)
          .maybeSingle();

        if (data && data.project_data) {
          const cleaned = cleanProjectData(data.project_data);
          if (cleaned) {
            setProject(cleaned);
            localStorage.setItem(projectId, JSON.stringify(cleaned));
          }
        } else if (!localData) {
          const blank = cleanProjectData({ id: projectId });
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

  // 2. ⚡ 背景自動即時同步
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
        console.log('☁️ [Supabase] 雲端同步大成功');
      } catch (err) {
        console.error('❌ 雲端備份失敗:', err);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [project, projectId, loading]);

  // 🛠️ 核心看板操作函數（全部加強即時鎖定存檔）
  const addTask = (title: string, moduleId: string, status: string) => {
    if (!project) return;
    const newTask = {
      id: crypto.randomUUID(),
      moduleId,
      title,
      status,
      amount: 0,
      isPaid: false,
      updatedAt: new Date()
    };
    const updated = { ...project, tasks: [...project.tasks, newTask] };
    setProject(updated);
    localStorage.setItem(projectId, JSON.stringify(updated));
  };

  const deleteTask = (id: string) => {
    if (!project) return;
    const updated = { ...project, tasks: project.tasks.filter((t: any) => t.id !== id) };
    setProject(updated);
    localStorage.setItem(projectId, JSON.stringify(updated));
  };

  const updateTask = (id: string, updates: any) => {
    if (!project) return;
    const updatedTasks = project.tasks.map((t: any) => t.id === id ? { ...t, ...updates } : t);
    const updated = { ...project, tasks: updatedTasks };
    setProject(updated);
    localStorage.setItem(projectId, JSON.stringify(updated));
  };

  return { project, loading, addTask, deleteTask, updateTask };
}