'use client';

// 🚨 告訴 Vercel 編譯器：這是動態資料庫網頁，打包期請直接跳過靜態預渲染，百分之百防爆！
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useProjectData } from '../hooks/useProjectData'; // 🔌 引入你強大的雲端同步 Hook

export default function Home() {
  // 固定使用你的專案 ID (例如 Man's Game)
  const projectId = 'mans-game'; 
  const { 
    project, 
    loading, 
    addTask, 
    deleteTask, 
    updateTask, 
    updateProject, 
    addStatus, 
    deleteStatus, 
    toggleStatusCollapse, 
    moveStatus 
  } = useProjectData(projectId);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeModule, setActiveModule] = useState<string>('Scripting');
  const [newStatusName, setNewStatusName] = useState('');

  // 🔄 處理匯入/還原舊資料的備用機制
  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        updateProject(parsed);
        alert('☁️ 資料成功載入！已自動同步推上 Supabase 雲端大腦！');
      } catch (err) {
        alert('❌ 檔案格式錯誤，請確保是正確的 JSON 檔案！');
      }
    };
    reader.readAsText(file);
  };

  // ⏳ 雲端載入中的優雅畫面
  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-900 text-white gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <p className="text-slate-400 font-medium">⚡ 正在即時同步雲端資料庫...</p>
      </div>
    );
  }

  // 🛡️ 防呆：如果雲端和本地都還沒有資料，給予一組漂亮的初始結構
  const currentProject = project || {
    name: "Man's Game 全新雲端專案",
    isFlatRate: false,
    tasks: [],
    moduleConfigs: [
      { moduleId: 'Scripting', customStatuses: ['💡 構想中', '✍️ 撰寫中', '✅ 已定稿'], collapsedStatuses: [] },
      { moduleId: 'OnSite', customStatuses: ['🎥 準備中', '🎬 拍攝中', '📦 已殺青'], collapsedStatuses: [] },
      { moduleId: 'PostProduction', customStatuses: ['✂️ 初剪中', '🎨 調色/特效', '🎉 完稿審核'], collapsedStatuses: [] },
      { moduleId: 'Finance', customStatuses: ['📝 待請款', '⏳ 審核中', '💰 已入帳'], collapsedStatuses: [] }
    ]
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* 頂部導覽列 */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r bg-indigo-400 to-cyan-400">
            {(currentProject as any).name || "未命名影視專案"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">🔌 Supabase 雲端大腦已連線 • 全裝置即時同步中</p>
        </div>

        {/* 還原備份按鍵 */}
        <div className="flex items-center gap-2">
          <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition">
            📂 還原/匯入本地 JSON
            <input type="file" accept=".json" onChange={handleJsonImport} className="hidden" />
          </label>
        </div>
      </header>

      {/* 主工作區面板 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左側模組切換 */}
        <div className="lg:col-span-1 bg-slate-900/50 p-4 rounded-xl border border-slate-800 h-fit">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">工作看板模組</h3>
          <div className="flex flex-col gap-1">
            {[
              { id: 'Scripting', name: '✍️ 腳本階段' },
              { id: 'OnSite', name: '🎥 拍攝現場' },
              { id: 'PostProduction', name: '✂️ 後期剪輯' },
              { id: 'Finance', name: '💰 財務帳目 (連動)' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition ${
                  activeModule === m.id 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* 右側看板主體 */}
        <div className="lg:col-span-3 space-y-6">
          {/* 快速新增任務 */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex gap-3">
            <input
              type="text"
              placeholder={`💡 在當前模組快速新增任務...`}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTaskTitle.trim()) {
                  const config = currentProject.moduleConfigs.find(c => c.moduleId === activeModule);
                  const firstStatus = config?.customStatuses[0] || '未分類';
                  addTask(newTaskTitle.trim(), activeModule as any, firstStatus);
                  setNewTaskTitle('');
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              onClick={() => {
                if (!newTaskTitle.trim()) return;
                const config = currentProject.moduleConfigs.find(c => c.moduleId === activeModule);
                const firstStatus = config?.customStatuses[0] || '未分類';
                addTask(newTaskTitle.trim(), activeModule as any, firstStatus);
                setNewTaskTitle('');
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
            >
              新增
            </button>
          </div>

          {/* 看板狀態欄列 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(currentProject.moduleConfigs.find(c => c.moduleId === activeModule)?.customStatuses || []).map((status) => {
              const moduleTasks = currentProject.tasks.filter(t => t.moduleId === activeModule && t.status === status);
              return (
                <div key={status} className="bg-slate-900/40 rounded-xl border border-slate-800/80 p-4 flex flex-col min-h-[300px]">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                    <span className="font-semibold text-sm text-slate-300 flex items-center gap-2">
                      {status}
                      <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">{moduleTasks.length}</span>
                    </span>
                  </div>

                  {/* 任務卡片列表 */}
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {moduleTasks.map((task) => (
                      <div key={task.id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg hover:border-slate-700 transition shadow-sm group">
                        <div className="flex justify-between items-start gap-2">
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => updateTask(task.id, { title: e.target.value })}
                            className="bg-transparent text-sm text-slate-200 font-medium focus:outline-none focus:bg-slate-950 px-1 py-0.5 rounded w-full"
                          />
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="text-slate-500 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition"
                          >
                            ✕
                          </button>
                        </div>

                        {/* 財務模組專用欄位 */}
                        {activeModule === 'Finance' && (
                          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-500">NT$</span>
                              <input
                                type="number"
                                value={task.amount || 0}
                                onChange={(e) => updateTask(task.id, { amount: Number(e.target.value) })}
                                className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={task.isPaid || false}
                                onChange={(e) => updateTask(task.id, { isPaid: e.target.checked })}
                                className="rounded border-slate-800 text-indigo-600 focus:ring-0 bg-slate-950 h-3.5 w-3.5"
                              />
                              <span className="text-xs text-slate-400 font-medium select-none">已支付</span>
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                    {moduleTasks.length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-8 italic">尚無任何任務</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}