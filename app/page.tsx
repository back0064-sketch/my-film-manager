'use client';

import { useState, useEffect, useRef } from 'react';
import { useProjectData } from '../hooks/useProjectData';
import { AVAILABLE_MODULES, ModuleId } from '../constants/modules';
import KanbanBoard from '../components/KanbanBoard';
import TaskDetailSidebar from '../components/TaskDetailSidebar';

export default function Dashboard() {
  const [projectList, setProjectList] = useState<{id: string, name: string, isArchived?: boolean}[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isFinanceExpanded, setIsFinanceExpanded] = useState(false);
  const [isPrivacyHidden, setIsPrivacyHidden] = useState(true);
  const [initialModules, setInitialModules] = useState<ModuleId[]>([]);
  
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = localStorage.getItem('all_projects_index');
    if (list) setProjectList(JSON.parse(list));
  }, []);

  const { 
    project, addTask, deleteTask, updateTask, updateProject, 
    addStatus, deleteStatus, toggleStatusCollapse, moveStatus 
  } = useProjectData(currentId || '');

  // 專案歸檔與刪除管理
  const toggleArchiveProject = (e: React.MouseEvent, id: string, isArchived: boolean) => {
    e.stopPropagation();
    const actionName = isArchived ? "解除封存，移回進行中" : "封存此專案";
    if (window.confirm(`確定要${actionName}嗎？`)) {
      const newList = projectList.map(p => p.id === id ? { ...p, isArchived: !isArchived } : p);
      setProjectList(newList);
      localStorage.setItem('all_projects_index', JSON.stringify(newList));
    }
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (window.confirm(`🚨 警告：確定要永久刪除「${name}」嗎？刪除後所有資料將無法恢復！`)) {
      const newList = projectList.filter(p => p.id !== id);
      setProjectList(newList);
      localStorage.setItem('all_projects_index', JSON.stringify(newList));
      localStorage.removeItem(id);
    }
  };

  const getProjectProgress = (projId: string) => {
    const raw = localStorage.getItem(projId);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    if (!data.tasks || data.tasks.length === 0) return 0;
    const completed = data.tasks.filter((t: any) => {
      const config = data.moduleConfigs.find((c: any) => c.moduleId === t.moduleId);
      if (!config) return false;
      return t.status === config.customStatuses[config.customStatuses.length - 1];
    });
    return Math.round((completed.length / data.tasks.length) * 100);
  };

  // 資料打包備份匯出
  const exportData = () => {
    const all: any = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('project_') || k === 'all_projects_index')) all[k] = localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
  };

  const importData = (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const d = JSON.parse(ev.target?.result as string);
      if (confirm("匯入將覆蓋目前資料，確定嗎？")) {
        Object.keys(d).forEach(k => localStorage.setItem(k, d[k]));
        window.location.reload();
      }
    };
    r.readAsText(f);
  };

  // 隱私數字金額轉換
  const formatAmt = (n: number) => isPrivacyHidden ? "****" : `$${n.toLocaleString()}`;

  // 計算跨專案全局財務報表
  const getGlobalFinanceSummary = () => {
    let globalTotal = 0;
    let globalPaid = 0;
    const rows = projectList.map(p => {
      const raw = localStorage.getItem(p.id);
      if (!raw) return { id: p.id, name: p.name, total: 0, paid: 0, pending: 0, isArchived: !!p.isArchived };
      const data = JSON.parse(raw);
      const fTasks = data.tasks?.filter((t: any) => t.moduleId === 'Finance') || [];
      const projectTotal = fTasks.reduce((s: number, t: any) => s + (t.isTaxInclusive ? (t.amount || 0) : Math.round((t.amount || 0) * 1.05)), 0);
      const projectPaid = fTasks.filter((t: any) => t.isPaid).reduce((s: number, t: any) => s + (t.isTaxInclusive ? (t.amount || 0) : Math.round((t.amount || 0) * 1.05)), 0);
      globalTotal += projectTotal;
      globalPaid += projectPaid;
      return { id: p.id, name: p.name, total: projectTotal, paid: projectPaid, pending: projectTotal - projectPaid, isArchived: !!p.isArchived };
    });
    return { rows, total: globalTotal, paid: globalPaid, pending: globalTotal - globalPaid };
  };

  const globalFinance = getGlobalFinanceSummary();

  // 計算內頁當前月份收付進度
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const financeTasks = project?.tasks.filter(t => t.moduleId === 'Finance') || [];
  const currentMonthFinanceTasks = financeTasks.filter(t => {
    const dateSource = t.paidAt || t.updatedAt;
    if (!dateSource) return false;
    const d = new Date(dateSource);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonthStr;
  });

  const total = currentMonthFinanceTasks.reduce((s, t) => s + (t.isTaxInclusive ? (t.amount || 0) : Math.round((t.amount || 0) * 1.05)), 0);
  const paid = currentMonthFinanceTasks.filter(t => t.isPaid).reduce((s, t) => s + (t.isTaxInclusive ? (t.amount || 0) : Math.round((t.amount || 0) * 1.05)), 0);
  const pending = total - paid;

  // ==========================================
  // 1. 視覺渲染：專案大廳 (首頁)
  // ==========================================
  if (!currentId) {
    const displayedProjects = projectList.filter(p => activeTab === 'active' ? !p.isArchived : p.isArchived);

    return (
      <main className="min-h-screen bg-slate-950 p-12 text-white font-sans flex flex-col overflow-y-auto">
        <header className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-6xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 uppercase">專案大廳</h1>
            <div className="flex gap-4 mt-6">
              <button onClick={exportData} className="text-[10px] font-black text-slate-500 border border-slate-800 px-4 py-1.5 rounded-full uppercase hover:text-white transition-colors">備份資料 (JSON)</button>
              <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-slate-500 border border-slate-800 px-4 py-1.5 rounded-full uppercase hover:text-white transition-colors">還原資料</button>
              <input type="file" ref={fileInputRef} onChange={importData} className="hidden" accept=".json" />
            </div>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-white text-black font-black px-10 py-5 rounded-full shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:scale-105 transition-all">新增專案 +</button>
        </header>

        {/* 全域專案財務總覽統計中心 */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-[36px] p-8 mb-12 space-y-8">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black tracking-wide">全專案財務核心總覽</h2>
              <button onClick={() => setIsPrivacyHidden(!isPrivacyHidden)} className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md hover:text-white transition-colors">
                隱私遮罩 {isPrivacyHidden ? '🔒 關閉' : '👁️ 開啟'}
              </button>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">資料即時串接庫</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-950/60 p-6 rounded-2xl border border-slate-800/60">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">業務總體營收額</p>
              <p className="text-3xl font-black text-blue-400 mt-2">{formatAmt(globalFinance.total)}</p>
            </div>
            <div className="bg-slate-950/60 p-6 rounded-2xl border border-slate-800/60">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">累計已入帳款</p>
              <p className="text-3xl font-black text-emerald-400 mt-2">{formatAmt(globalFinance.paid)}</p>
            </div>
            <div className="bg-slate-950/60 p-6 rounded-2xl border border-slate-800/60">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">市場未收尾款</p>
              <p className="text-3xl font-black text-amber-500 mt-2">{formatAmt(globalFinance.pending)}</p>
            </div>
          </div>

          <div className="overflow-x-auto bg-slate-950/30 rounded-2xl border border-slate-800/40 p-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="pb-3 pl-2">專案項目名稱</th>
                  <th className="pb-3">目前狀態</th>
                  <th className="pb-3 text-right">總預算</th>
                  <th className="pb-3 text-right text-emerald-500">已入帳</th>
                  <th className="pb-3 text-right text-amber-500 pr-2">待收尾款</th>
                </tr>
              </thead>
              <tbody className="text-sm font-bold divide-y divide-slate-900">
                {globalFinance.rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-900/30 transition-colors group">
                    <td className="py-4 pl-2 text-slate-200">{row.name}</td>
                    <td className="py-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md ${row.isArchived ? 'bg-slate-800 text-slate-400' : 'bg-blue-950 text-blue-400'}`}>
                        {row.isArchived ? '已歸檔' : '進行中'}
                      </span>
                    </td>
                    <td className="py-4 text-right text-slate-400 font-mono">{formatAmt(row.total)}</td>
                    <td className="py-4 text-right text-emerald-400/80 font-mono">{formatAmt(row.paid)}</td>
                    <td className="py-4 text-right text-amber-400/80 font-mono pr-2">{formatAmt(row.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 頁籤選擇器 */}
        <div className="flex gap-8 border-b border-slate-800 mb-10">
          <button onClick={() => setActiveTab('active')} className={`pb-4 text-sm font-black tracking-widest uppercase transition-colors relative ${activeTab === 'active' ? 'text-white' : 'text-slate-600 hover:text-slate-400'}`}>
            進行中專案
            {activeTab === 'active' && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-500 rounded-t-full"></div>}
          </button>
          <button onClick={() => setActiveTab('archived')} className={`pb-4 text-sm font-black tracking-widest uppercase transition-colors relative ${activeTab === 'archived' ? 'text-white' : 'text-slate-600 hover:text-slate-400'}`}>
            已歸檔檔案庫
            {activeTab === 'archived' && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-emerald-500 rounded-t-full"></div>}
          </button>
        </div>

        {/* 專案卡片列表區 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {displayedProjects.map(p => {
            const prog = getProjectProgress(p.id);
            return (
              <div key={p.id} onClick={() => setCurrentId(p.id)} className="group bg-slate-900/40 p-10 rounded-[45px] border border-slate-800 hover:border-blue-500/50 cursor-pointer transition-all relative overflow-hidden">
                 <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 flex gap-2 transition-all duration-300 z-10">
                   <button onClick={(e) => toggleArchiveProject(e, p.id, !!p.isArchived)} className="text-[10px] font-black bg-slate-800/80 backdrop-blur-sm text-slate-300 px-3 py-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-colors">
                     {p.isArchived ? '解除封存' : '封存歸檔'}
                   </button>
                   <button onClick={(e) => handleDeleteProject(e, p.id, p.name)} className="text-[10px] font-black bg-slate-800/80 backdrop-blur-sm text-slate-300 px-3 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-colors">
                     刪除
                   </button>
                 </div>

                 <div className={`w-12 h-1.5 mb-8 group-hover:w-24 transition-all rounded-full ${p.isArchived ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                 <h3 className="text-3xl font-bold text-white group-hover:text-blue-400 pr-20">{p.name}</h3>
                 
                 <div className="mt-10 space-y-3">
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase"><span>專案進度</span><span className={p.isArchived ? 'text-emerald-500' : 'text-blue-500'}>{prog}%</span></div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      {/* 【在此修正語法錯誤：補回封閉大於符號 > 】 */}
                      <div className={`h-full ${p.isArchived ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-emerald-400'}`} style={{ width: `${prog}%` }}></div>
                    </div>
                 </div>
              </div>
            );
          })}
        </div>

        {/* 建立專案視窗 */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[100] flex items-center justify-center p-6">
            <div className="bg-slate-900 w-full max-w-2xl rounded-[55px] p-12 border border-slate-800">
              <h2 className="text-4xl font-black mb-10 italic uppercase text-white">建立新專案</h2>
              <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full bg-slate-800 rounded-2xl p-6 text-xl font-bold text-white outline-none mb-8 focus:ring-2 focus:ring-blue-500" placeholder="例如：Man's Game" />
              <div className="flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 font-black text-slate-500 hover:text-white transition-colors">取消</button>
                <button onClick={() => {
                  if(!newProjectName.trim()) return alert("請輸入專案名稱");
                  const newId = `project_${Date.now()}`;
                  const newList = [...projectList, { id: newId, name: newProjectName, isArchived: false }];
                  setProjectList(newList);
                  localStorage.setItem('all_projects_index', JSON.stringify(newList));
                  
                  const init = { 
                    id: newId, 
                    projectName: newProjectName, 
                    clientName: "待設定", 
                    enabledModules: ['Scripting', 'OnSite', 'PostProduction', 'Finance'], 
                    collapsedModules: [], 
                    moduleConfigs: AVAILABLE_MODULES.map(m => ({ 
                      moduleId: m.id, 
                      customStatuses: [...m.defaultStatuses], 
                      collapsedStatuses: [] 
                    })), 
                    tasks: [], 
                    isFlatRate: false, 
                    createdAt: new Date() 
                  };
                  
                  localStorage.setItem(newId, JSON.stringify(init));
                  setCurrentId(newId); setIsModalOpen(false); setNewProjectName('');
                }} className="flex-[2] bg-blue-600 py-5 rounded-2xl font-black hover:bg-blue-500 transition-all">確認建立</button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ==========================================
  // 2. 視覺渲染：專案內部工作區
  // ==========================================
  const selectedTask = project?.tasks.find(t => t.id === selectedTaskId) || null;
  const activeModules = AVAILABLE_MODULES.filter(m => project?.enabledModules.includes(m.id));

  return (
    <main className="min-h-screen bg-slate-50 flex overflow-hidden font-sans relative">
      <div className={`flex-1 transition-all duration-500 ${selectedTaskId ? 'mr-96' : ''}`}>
        <header className="p-8 flex justify-between items-end bg-white border-b border-slate-100">
          <div>
            <button onClick={() => setCurrentId(null)} className="text-blue-600 text-[10px] font-black uppercase mb-2 block tracking-widest">← 返回專案大廳</button>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">{project?.projectName}</h1>
          </div>
          <button onClick={() => { setInitialModules([...(project?.enabledModules || [])]); setIsSettingsOpen(true); }} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all">專案設定</button>
        </header>

        <div className="flex overflow-x-auto p-8 gap-6 h-[calc(100vh-160px)] no-scrollbar items-start">
          {activeModules.map((module) => {
            const config = project?.moduleConfigs?.find(c => c.moduleId === module.id);
            const isCollapsed = project?.collapsedModules?.includes(module.id) || false;
            return (
              <KanbanBoard key={module.id} module={module.id} tasks={project?.tasks.filter(t => t.moduleId === module.id) || []}
                statusList={config?.customStatuses || []} isCollapsed={isCollapsed} collapsedStatuses={config?.collapsedStatuses || []}
                onToggleCollapse={() => { const list = project?.collapsedModules || []; updateProject({ collapsedModules: list.includes(module.id) ? list.filter(x => x !== module.id) : [...list, module.id] }); }}
                onToggleStatusCollapse={(s) => toggleStatusCollapse(module.id, s)} onMoveStatus={(s, dir) => moveStatus(module.id, s, dir)}
                onAddTask={addTask} onDeleteTask={deleteTask} onTaskClick={(id) => setSelectedTaskId(id)}
                onAddStatus={addStatus} onDeleteStatus={deleteStatus}
              />
            );
          })}
          <div className="flex-shrink-0 w-40 h-1"></div>
        </div>

        {financeTasks.length > 0 && (
          <div className="fixed bottom-8 right-8 z-40 flex flex-col items-end gap-4">
            {isFinanceExpanded ? (
              <div className="bg-slate-900 text-white p-6 rounded-[32px] border border-slate-800 flex items-center gap-8 shadow-2xl backdrop-blur-md bg-opacity-95">
                <div onClick={() => setIsPrivacyHidden(!isPrivacyHidden)} className="cursor-pointer">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">當月總計 {isPrivacyHidden ? '🔒' : '👁️'}</p>
                  <p className="text-lg font-black">{formatAmt(total)}</p>
                </div>
                <div className="w-[1px] h-8 bg-slate-800"></div>
                <div><p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">當月已付</p><p className="text-lg font-black text-emerald-400">{formatAmt(paid)}</p></div>
                <div className="w-[1px] h-8 bg-slate-800"></div>
                <div><p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">當月未付</p><p className="text-lg font-black text-amber-400">{formatAmt(pending)}</p></div>
                <button onClick={() => setIsFinanceExpanded(false)} className="text-slate-500 hover:text-white">✕</button>
              </div>
            ) : (
              <button onClick={() => setIsFinanceExpanded(true)} className="bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all">當月財務概況 <span className="ml-2 text-blue-400">{formatAmt(total)}</span></button>
            )}
          </div>
        )}
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 text-slate-900">
          <div className="bg-white w-full max-w-lg rounded-[45px] p-10 shadow-2xl relative font-sans">
            <button onClick={() => { if(confirm("捨棄未儲存的變更嗎？")) { updateProject({enabledModules: initialModules}); setIsSettingsOpen(false); } }} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900">✕</button>
            <h2 className="text-3xl font-black mb-6 italic uppercase">專案設定</h2>
            <div className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-sm font-black text-slate-800 block">整包 (全包) 計費模式</span>
                  <span className="text-[10px] font-medium text-slate-400 block mt-0.5">開啟後，建立腳本/拍攝/剪輯將不再自動衍生款項</span>
                </div>
                <button onClick={() => updateProject({ isFlatRate: !project?.isFlatRate })} className={`px-4 py-2 rounded-xl text-xs font-black tracking-widest transition-all shadow-sm ${project?.isFlatRate ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {project?.isFlatRate ? '已開啟全包' : '拆件請款制'}
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">開啟/關閉專案看板</label>
                <div className="grid grid-cols-1 gap-2.5">
                  {AVAILABLE_MODULES.map(m => (
                    <div key={m.id} onClick={() => { const cur = project?.enabledModules || []; updateProject({ enabledModules: cur.includes(m.id) ? cur.filter(x => x !== m.id) : [...cur, m.id] }); }} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${project?.enabledModules.includes(m.id) ? 'border-blue-600 bg-blue-50' : 'border-slate-100'}`}>
                      <span className={`text-sm font-bold ${project?.enabledModules.includes(m.id) ? 'text-blue-700' : 'text-slate-400'}`}>{m.name}</span>
                      {project?.enabledModules.includes(m.id) && <span className="text-blue-600 font-black text-xs">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black mt-2 hover:bg-blue-600 transition-all">儲存並關閉</button>
            </div>
          </div>
        </div>
      )}

      {selectedTaskId && (
        <TaskDetailSidebar task={selectedTask} allTasks={project?.tasks || []} 
          statusList={project?.moduleConfigs?.find(c => c.moduleId === selectedTask?.moduleId)?.customStatuses || []}
          onClose={() => setSelectedTaskId(null)} onUpdateTask={updateTask}
        />
      )}
    </main>
  );
}