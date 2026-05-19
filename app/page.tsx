'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useProjectData } from '../hooks/useProjectData';

export default function Home() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<{ id: string; name: string; updated_at: string }[]>([]);
  const [lobbyLoading, setLobbyLoading] = useState<boolean>(true);
  const [newProjectName, setNewProjectName] = useState('');

  // 1. 🔍 專案大廳：讀取列表
  useEffect(() => {
    if (activeProjectId) return;

    async function loadLobbyProjects() {
      setLobbyLoading(true);
      try {
        const { data, error } = await supabase
          .from('film_projects')
          .select('id, name, updated_at')
          .order('updated_at', { ascending: false });

        if (data && data.length > 0) {
          setProjectList(data);
        } else {
          // 🛟 雲端沒拿到列表時，去讀本地存過的所有專案當作備用顯示
          const localKeys = Object.keys(localStorage).filter(k => k.length > 30); // 篩選出 UUID 的 key
          const fallbackList = localKeys.map(k => {
            try {
              const p = JSON.parse(localStorage.getItem(k) || '');
              return { id: k, name: p.name || '未命名專案', updated_at: new Date().toISOString() };
            } catch {
              return null;
            }
          }).filter(Boolean) as any;
          setProjectList(fallbackList);
        }
      } catch (err) {
        console.error('❌ 撈取大廳失敗:', err);
      } finally {
        setLobbyLoading(false);
      }
    }
    loadLobbyProjects();
  }, [activeProjectId]);

  // ➕ 大廳功能：建立專案（本地優先雙保險）
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const newId = crypto.randomUUID();
    const defaultData = {
      id: newId,
      name: newProjectName.trim(),
      isFlatRate: false,
      tasks: [],
      moduleConfigs: [
        { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'], collapsedStatuses: [] },
        { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'], collapsedStatuses: [] },
        { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'], collapsedStatuses: [] },
        { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'], collapsedStatuses: [] }
      ]
    };

    // 💾 絕對優先存入本地，保證名字絕對是你取的那一個！
    localStorage.setItem(newId, JSON.stringify(defaultData));

    // ☁️ 背景嘗試送雲端
    await supabase.from('film_projects').upsert({
      id: newId,
      name: newProjectName.trim(),
      project_data: defaultData,
      updated_at: new Date().toISOString()
    });

    setNewProjectName('');
    setActiveProjectId(newId); // 秒進專案房間
  };

  // 📂 大廳功能：匯入 JSON（本地優先雙保險）
  const handleJsonImportToLobby = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const importedId = parsed.id || crypto.randomUUID();
        const importedName = parsed.name || "未命名匯入專案";

        // 💾 絕對優先塞入本地快取，保證資料與卡片完全被釋放，出來絕不空白！
        localStorage.setItem(importedId, JSON.stringify(parsed));

        // ☁️ 背景再推雲端
        await supabase.from('film_projects').upsert({
          id: importedId,
          name: importedName,
          project_data: parsed,
          updated_at: new Date().toISOString()
        });

        alert(`📂 【${importedName}】已安全匯入系統！`);
        setActiveProjectId(importedId);
      } catch (err) {
        alert('❌ 檔案格式解析失敗，請確保是正確的專案 JSON 備份檔！');
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
              <p className="text-slate-400 text-sm mt-2">中央控制大廳 • 本地與雲端雙軌同步中</p>
            </div>
            <label className="cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition">
              📂 匯入舊專案 JSON
              <input type="file" accept=".json" onChange={handleJsonImportToLobby} className="hidden" />
            </label>
          </header>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl mb-8 flex flex-col sm:flex-row gap-4 items-center">
            <input
              type="text"
              placeholder="✨ 輸入全新影視專案名稱..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
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

          {lobbyLoading ? (
            <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
              <p className="text-sm">載入看板中...</p>
            </div>
          ) : projectList.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
              <p className="text-slate-500 text-sm italic">尚無任何專案，請在上方建立或匯入專案。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectList.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 p-6 rounded-2xl cursor-pointer transition flex justify-between items-center group shadow-sm"
                >
                  <div>
                    <h3 className="font-bold text-lg text-slate-200 group-hover:text-indigo-400 transition">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">系統已全面保護此專案看板</p>
                  </div>
                  <span className="text-slate-600 group-hover:text-indigo-400 text-xl transition transform group-hover:translate-x-1">➔</span>
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
  const { 
    project, 
    loading, 
    addTask, 
    deleteTask, 
    updateTask, 
    addStatus, 
    deleteStatus 
  } = useProjectData(projectId);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeModule, setActiveModule] = useState<string>('Scripting');

  const currentProject = project || {
    name: "載入中專案...",
    tasks: [],
    moduleConfigs: []
  };

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
                {(currentProject as any).name || "未命名專案"}
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">本地優先保護模式啟動中</p>
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
              ].map((m) => (
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
                placeholder="💡 新增一項任務並按下 Enter..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) {
                    const config = (currentProject.moduleConfigs || []).find(c => c.moduleId === activeModule);
                    const firstStatus = config?.customStatuses?.[0] || '未分類';
                    addTask(newTaskTitle.trim(), activeModule as any, firstStatus);
                    setNewTaskTitle('');
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {((currentProject.moduleConfigs || []).find(c => c.moduleId === activeModule)?.customStatuses || []).map((status) => {
                const moduleTasks = (currentProject.tasks || []).filter(t => t.moduleId === activeModule && t.status === status);
                return (
                  <div key={status} className="bg-slate-900/20 rounded-xl border border-slate-800 p-4 flex flex-col min-h-[350px]">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/60">
                      <span className="font-bold text-xs text-slate-400 tracking-wide uppercase">{status}</span>
                      <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">{moduleTasks.length}</span>
                    </div>

                    <div className="space-y-2 flex-1 overflow-y-auto">
                      {moduleTasks.map((task) => (
                        <div key={task.id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg hover:border-slate-700 transition group shadow-sm">
                          <div className="flex justify-between items-start gap-2">
                            <input
                              type="text"
                              value={task.title}
                              onChange={(e) => updateTask(task.id, { title: e.target.value })}
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
                                  onChange={(e) => updateTask(task.id, { amount: Number(e.target.value) })}
                                  className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-emerald-400 focus:outline-none"
                                />
                              </div>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={task.isPaid || false}
                                  onChange={(e) => updateTask(task.id, { isPaid: e.target.checked })}
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