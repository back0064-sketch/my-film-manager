'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useProjectData } from '../hooks/useProjectData';

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

export default function Home() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<any[]>([]);
  const [lobbyLoading, setLobbyLoading] = useState<boolean>(true);
  const [newProjectName, setNewProjectName] = useState('');

  // 🔍 雙軌制智慧大廳載入器（本地極速打底 + 雲端合流）
  const loadLobbyProjects = async () => {
    setLobbyLoading(true);
    
    // 🛟 步驟 A：先從本地 LocalStorage 把存在電腦裡的所有專案撈出來，確保畫面絕對不空白！
    const localProjects: any[] = [];
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      Object.keys(localStorage).forEach(key => {
        if (uuidRegex.test(key)) {
          const str = localStorage.getItem(key);
          if (str) {
            try {
              const parsed = JSON.parse(str);
              const cleaned = cleanProjectData(parsed);
              if (cleaned) {
                localProjects.push({
                  id: cleaned.id,
                  name: cleaned.name,
                  updated_at: new Date().toISOString()
                });
              }
            } catch(e){}
          }
        }
      });
    } catch (e) { console.error(e); }
    
    // 先用本地的墊底顯示
    setProjectList(localProjects);

    // 🛟 步驟 B：去雲端撈取合流，就算雲端卡死也絕對不影響本地顯示
    try {
      const { data } = await supabase
        .from('film_projects')
        .select('id, name, updated_at, project_data')
        .order('updated_at', { ascending: false });

      if (data && data.length > 0) {
        const mergedMap = new Map();
        localProjects.forEach(p => mergedMap.set(p.id, p));
        
        data.forEach((p: any) => {
          const cleaned = cleanProjectData(p.project_data || p);
          if (cleaned) {
            localStorage.setItem(p.id, JSON.stringify(cleaned)); // 背景幫本地補血快取
            mergedMap.set(p.id, {
              id: p.id,
              name: p.name || cleaned.name,
              updated_at: p.updated_at || new Date().toISOString()
            });
          }
        });
        setProjectList(Array.from(mergedMap.values()));
      }
    } catch (err) {
      console.error("雲端讀取受限，切換為純本地保護模式運行", err);
    } finally {
      setLobbyLoading(false);
    }
  };

  useEffect(() => {
    if (!activeProjectId) loadLobbyProjects();
  }, [activeProjectId]);

  // ➕ 建立新專案（本地絕對安全放行）
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const newId = crypto.randomUUID();
    const defaultData = cleanProjectData({ id: newId, name: newProjectName.trim() });

    // 💾 絕對優先存入本地，名字跟房間當場鎖死！
    localStorage.setItem(newId, JSON.stringify(defaultData));

    // ☁️ 背景嘗試 upsert 雲端，失敗也不准卡死介面
    try {
      await supabase.from('film_projects').upsert({
        id: newId,
        name: newProjectName.trim(),
        project_data: defaultData,
        updated_at: new Date().toISOString()
      });
    } catch (err) { console.error(err); }

    setNewProjectName('');
    setActiveProjectId(newId); // 🎯 秒進房間，絕對不卡死！
  };

  // 🗑️ 大廳刪除
  const handleDeleteProject = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`確定要永久刪除【${name}】這個專案看板嗎？`)) return;
    try {
      localStorage.removeItem(id);
      await supabase.from('film_projects').delete().eq('id', id);
    } catch (err) {}
    setProjectList((prev: any[]) => prev.filter((p: any) => p.id !== id));
  };

  // 📂 智慧解包匯入器
  const handleJsonImportToLobby = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event: any) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          for (const proj of parsed) {
            const cleaned = cleanProjectData(proj);
            if (cleaned) {
              localStorage.setItem(cleaned.id, JSON.stringify(cleaned));
              try {
                await supabase.from('film_projects').upsert({
                  id: cleaned.id,
                  name: cleaned.name,
                  project_data: cleaned,
                  updated_at: new Date().toISOString()
                });
              } catch (e) {}
            }
          }
          alert(`已智慧解包並成功匯入共 ${parsed.length} 個專案看板！`);
          loadLobbyProjects();
        } else {
          const cleaned = cleanProjectData(parsed);
          if (cleaned) {
            localStorage.setItem(cleaned.id, JSON.stringify(cleaned));
            try {
              await supabase.from('film_projects').upsert({
                id: cleaned.id,
                name: cleaned.name,
                project_data: cleaned,
                updated_at: new Date().toISOString()
              });
            } catch (e) {}
            alert(`📂 【${cleaned.name}】已成功匯入！`);
            setActiveProjectId(cleaned.id);
          }
        }
      } catch (err) {
        alert('檔案解析失敗');
      }
    };
    reader.readAsText(file);
  };

  if (!activeProjectId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          <header className="mb-12 border-b border-slate-800 pb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                🎬 影視製片控制台
              </h1>
              <p className="text-slate-400 text-sm mt-2">中央大廳 • 本地脫機保護模式已啟動</p>
            </div>
            <label className="cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition">
              📂 匯入舊專案 JSON
              <input type="file" accept=".json" onChange={handleJsonImportToLobby} className="hidden" />
            </label>
          </header>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl mb-8 flex flex-col sm:flex-row gap-4 items-center">
            <input
              type="text"
              placeholder="✨ 請輸入全新影視專案名稱..."
              value={newProjectName}
              onChange={(e: any) => setNewProjectName(e.target.value)}
              className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              onClick={handleCreateProject}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-3 rounded-xl transition shadow-md whitespace-nowrap"
            >
              ➕ 建立新專案
            </button>
          </div>

          <h2 className="text-lg font-bold text-slate-300 mb-4">🗂️ 當前專案看板清單 ({projectList.length})</h2>

          {lobbyLoading && projectList.length === 0 ? (
            <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
              <p className="text-sm">安全對齊中...</p>
            </div>
          ) : projectList.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-500 text-sm italic">尚無任何專案，請在上方建立或匯入舊 JSON。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectList.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 p-6 rounded-2xl cursor-pointer transition flex justify-between items-center group shadow-sm"
                >
                  <div>
                    <h3 className="font-bold text-lg text-slate-200 group-hover:text-indigo-400 transition">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">⚡ 本地快取安全保護中</p>
                  </div>
                  <button
                    onClick={(e: any) => handleDeleteProject(p.id, p.name, e)}
                    className="p-2 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-slate-950 opacity-0 group-hover:opacity-100 transition"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <InnerProjectBoard 
      projectId={activeProjectId} 
      onBackToLobby={() => setActiveProjectId(null)} 
    />
  );
}

function InnerProjectBoard({ projectId, onBackToLobby }: { projectId: string; onBackToLobby: () => void }) {
  const { project, loading, addTask, deleteTask, updateTask } = useProjectData(projectId);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeModule, setActiveModule] = useState<string>('Scripting');

  const currentProject = project || { name: "載入中專案...", tasks: [], moduleConfigs: [] };

  const configs = currentProject.moduleConfigs && currentProject.moduleConfigs.length > 0
    ? currentProject.moduleConfigs
    : [
        { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'] },
        { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'] },
        { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'] },
        { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'] }
      ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToLobby}
              className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              ⬅️ 返回專案大廳
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-100">
                {currentProject.name || "進行中專案"}
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">☁️ 數據雙軌同步保護中</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 h-fit">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">看板階段</h3>
            <div className="flex flex-col gap-1">
              {[
                { id: 'Scripting', name: '✍️ 腳本階段' },
                { id: 'OnSite', name: '🎥 拍攝現場' },
                { id: 'PostProduction', name: '✂️ 後期剪輯' },
                { id: 'Finance', name: '💰 財務帳目' }
              ].map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition ${
                    activeModule === m.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex gap-3">
              <input
                type="text"
                placeholder="💡 輸入任務名稱，按下 Enter 快速新增..."
                value={newTaskTitle}
                onChange={(e: any) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) {
                    const config = (configs as any[]).find((c: any) => c.moduleId === activeModule);
                    const firstStatus = config?.customStatuses?.[0] || '未分類';
                    addTask(newTaskTitle.trim(), activeModule as any, firstStatus);
                    setNewTaskTitle('');
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {((configs as any[]).find((c: any) => c.moduleId === activeModule)?.customStatuses || []).map((status: any) => {
                const moduleTasks = (currentProject.tasks || []).filter((t: any) => t.moduleId === activeModule && t.status === status);
                return (
                  <div key={status} className="bg-slate-900/20 rounded-xl border border-slate-800 p-4 flex flex-col min-h-[350px]">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/60">
                      <span className="font-bold text-xs text-slate-400 tracking-wide uppercase">{status}</span>
                      <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">{moduleTasks.length}</span>
                    </div>

                    <div className="space-y-2 flex-1 overflow-y-auto">
                      {moduleTasks.map((task: any) => (
                        <div key={task.id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg hover:border-slate-700 transition group shadow-sm">
                          <div className="flex justify-between items-start gap-2">
                            <input
                              type="text"
                              value={task.title}
                              onChange={(e: any) => updateTask(task.id, { title: e.target.value })}
                              className="bg-transparent text-sm text-slate-200 font-medium focus:outline-none focus:bg-slate-950 px-1 py-0.5 rounded w-full"
                            />
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="text-slate-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition"
                            >✕</button>
                          </div>

                          {activeModule === 'Finance' && (
                            <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-600">NT$</span>
                                <input
                                  type="number"
                                  value={task.amount || 0}
                                  onChange={(e: any) => updateTask(task.id, { amount: Number(e.target.value) })}
                                  className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-emerald-400 focus:outline-none"
                                />
                              </div>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={task.isPaid || false}
                                  onChange={(e: any) => updateTask(task.id, { isPaid: e.target.checked })}
                                  className="rounded border-slate-800 text-indigo-600 focus:ring-0 bg-slate-950 h-3.5 w-3.5"
                                />
                                <span className="text-xs text-slate-400 select-none">已支付</span>
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                      {moduleTasks.length === 0 && (
                        <p className="text-xs text-slate-700 text-center py-12 italic">尚無任務</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}