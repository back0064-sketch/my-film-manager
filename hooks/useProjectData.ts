import { useState, useEffect } from 'react';
import { FilmProject, Task } from '../types/project';
import { ModuleId } from '../constants/modules';
import { supabase } from '@/lib/supabase';

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

  // 1. 🔍 讀取資料：本地快取優先
  useEffect(() => {
    if (!projectId) return;

    async function fetchProject() {
      setLoading(true);
      
      const localData = localStorage.getItem(projectId);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (parsed && !Array.isArray(parsed)) setProject(parsed);
        } catch(e) { console.error(e); }
      }

      try {
        const { data, error } = await supabase
          .from('film_projects')
          .select('project_data')
          .eq('id', projectId)
          .maybeSingle();

        if (data && data.project_data) {
          const parsedData = data.project_data as any;
          if (parsedData && !Array.isArray(parsedData)) {
            parsedData.collapsedModules = parsedData.collapsedModules || [];
            parsedData.moduleConfigs = (parsedData.moduleConfigs || []).map((c: any) => ({
              ...c,
              collapsedStatuses: c.collapsedStatuses || []
            }));
            setProject(parsedData);
            localStorage.setItem(projectId, JSON.stringify(parsedData));
          }
        } else {
          if (!localData) {
            const newBlank = { ...DEFAULT_PROJECT_TEMPLATE, id: projectId };
            setProject(newBlank);
            localStorage.setItem(projectId, JSON.stringify(newBlank));
          }
        }
      } catch (err) {
        console.error('❌ 雲端讀取失敗:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  // 2. ⚡ 背景防抖同步
  useEffect(() => {
    if (!project || !projectId || loading || Array.isArray(project)) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        await supabase
          .from('film_projects')
          .upsert({
            id: projectId,
            name: (project as any).name || '未命名專案',
            project_data: project as any,
            updated_at: new Date().toISOString()
          });
        console.log('☁️ [Supabase] 雲端即時備份成功');
      } catch (err) {
        console.error('❌ 雲端備份失敗:', err);
      }
    }, 800);

    return () => clearTimeout(delayDebounceFn);
  }, [project, projectId, loading]);

  // 🛠️ 強制即時鎖定 mutator 函數
  const updateProject = (u: any) => {
    setProject((prev) => {
      const next = prev ? { ...prev, ...u } : u;
      localStorage.setItem(projectId, JSON.stringify(next));
      return next;
    });
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    if (!project) return;
    let updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: new Date() } : t);
    const nextProject = { ...project, tasks: updatedTasks };
    setProject(nextProject);
    localStorage.setItem(projectId, JSON.stringify(nextProject));
  };
  
  const addTask = (title: string, mId: ModuleId, s: string) => {
    if (!project) return;
    const newTaskId = crypto.randomUUID();
    const newTask: Task = { id: newTaskId, moduleId: mId, title, status: s, note: "", subTasks: [], assets: [], amount: 0, isPaid: false, updatedAt: new Date() };
    const nextProject = { ...project, tasks: [...project.tasks, newTask] };
    setProject(nextProject);
    localStorage.setItem(projectId, JSON.stringify(nextProject));
  };
  
  const deleteTask = (id: string) => {
    if (!project) return;
    const nextProject = { ...project, tasks: project.tasks.filter(t => t.id !== id) };
    setProject(nextProject);
    localStorage.setItem(projectId, JSON.stringify(nextProject));
  };
  
  const addStatus = (mId: ModuleId, name: string) => {
    if (!project) return;
    const newConfigs = project.moduleConfigs.map(c => c.moduleId === mId ? { ...c, customStatuses: [...c.customStatuses, name] } : c);
    const nextProject = { ...project, moduleConfigs: newConfigs };
    setProject(nextProject);
    localStorage.setItem(projectId, JSON.stringify(nextProject));
  };

  const deleteStatus = (mId: ModuleId, name: string) => {
    if (!project) return;
    const newConfigs = project.moduleConfigs.map(c => c.moduleId === mId ? { ...c, customStatuses: c.customStatuses.filter(s => s !== name) } : c);
    const nextProject = { ...project, moduleConfigs: newConfigs };
    setProject(nextProject);
    localStorage.setItem(projectId, JSON.stringify(nextProject));
  };

  return { project, loading, addTask, deleteTask, updateTask, updateProject, addStatus, deleteStatus };
}