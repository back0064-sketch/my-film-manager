'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ClientDashboard } from '@/app/client-dashboard';
import { ProjectSummary, ProjectWorkspaceNavigation } from '@/app/project-overview';
import { ProjectSettlementPanel } from '@/app/project-settlement-panel';
import { useProjectData } from '@/hooks/useProjectData';
import { projectApi } from '@/lib/client/project-api';
import { clearLocalProjectCache } from '@/lib/client/project-cache';
import { ModuleId, PROJECT_TYPES, ProjectType, WORKSPACE_MODULES } from '@/types/project';

type SessionUser = { id: string; email?: string };

const ProjectFinancePanel = dynamic(
  () => import('@/app/project-finance-panel').then((module) => module.ProjectFinancePanel),
  { loading: () => <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">財務資料載入中…</main> },
);

export default function Home() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    void projectApi.session().then(setUser).catch(() => setUser(null)).finally(() => setSessionLoading(false));
  }, []);

  if (sessionLoading) return <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">登入狀態確認中…</main>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  if (activeProjectId) return <ProjectBoard projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />;
  return <ClientDashboard userEmail={user.email} onOpenProject={setActiveProjectId} onSignOut={() => void projectApi.signOut().finally(() => { clearLocalProjectCache(localStorage); setUser(null); })} />;
}


function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true); setMessage('');
    try {
      if (mode === 'signIn') onAuthenticated(await projectApi.signIn(email, password));
      else {
        const result = await projectApi.signUp(email, password);
        setMessage(result.needsEmailConfirmation ? '註冊成功，請到信箱完成驗證後再登入。' : '註冊成功，請使用新帳號登入。');
        setMode('signIn');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失敗'); }
    finally { setPending(false); }
  };
  const isSignIn = mode === 'signIn';
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl"><h1 className="text-3xl font-black text-indigo-400">🎬 影視製片控制台</h1><p className="mt-2 text-sm text-slate-400">{isSignIn ? '登入以存取你的專案。' : '建立帳號以開始管理專案。'}</p><div className="mt-6 space-y-4"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="電子郵件" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submit()} placeholder="密碼（至少 8 個字元）" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" /><button disabled={pending} onClick={() => void submit()} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '處理中…' : isSignIn ? '登入' : '註冊'}</button></div>{message && <p className="mt-4 text-sm text-amber-300">{message}</p>}<button onClick={() => { setMode(isSignIn ? 'signUp' : 'signIn'); setMessage(''); }} className="mt-6 text-sm text-indigo-400 hover:text-indigo-300">{isSignIn ? '還沒有帳號？立即註冊' : '已有帳號？回到登入'}</button></section></main>;
}

function ProjectBoard({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { project, loading, syncStatus, syncError, lastSyncedAt, retrySync, resolveConflict, renameProject, updateBudget, updateDefaultUnitPrice, closeMonth, updateSettlementBatch, reopenSettlementBatch, addMonthlySettlement, updateMonthlySettlement, deleteMonthlySettlement, updateProjectTemplate, addTask, deleteTask, updateTask } = useProjectData(projectId);
  const [activeModule, setActiveModule] = useState<ModuleId>('Scripting');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingStatus, setAddingStatus] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedMobileStatus, setSelectedMobileStatus] = useState<string | null>(null);
  if (loading || !project) return <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">專案載入中…</main>;
  if (activeModule === ('Finance' as ModuleId)) return <ProjectFinancePanel project={project} updateBudget={updateBudget} addMonthlySettlement={addMonthlySettlement} updateMonthlySettlement={updateMonthlySettlement} deleteMonthlySettlement={deleteMonthlySettlement} deleteTask={deleteTask} updateTask={updateTask} updateSettlementBatch={updateSettlementBatch} addTask={addTask} onBackToTasks={() => setActiveModule('Scripting')} />;

  const productionModules = WORKSPACE_MODULES.filter((module) => module.id !== 'Finance');
  const productionTasks = project.tasks.filter((task) => task.moduleId !== 'Finance' && !task.archivedAt);
  const completedTasks = productionTasks.filter((task) => {
    const statuses = project.moduleConfigs.find((config) => config.moduleId === task.moduleId)?.customStatuses ?? [];
    return task.status === statuses.at(-1);
  });
  const completionRate = productionTasks.length ? Math.round((completedTasks.length / productionTasks.length) * 100) : 0;
  const moduleSummaries = productionModules.map((module) => {
    const tasks = productionTasks.filter((task) => task.moduleId === module.id);
    const statuses = project.moduleConfigs.find((config) => config.moduleId === module.id)?.customStatuses ?? [];
    const completed = tasks.filter((task) => task.status === statuses.at(-1)).length;
    return { ...module, total: tasks.length, completed };
  });
  const statuses = project.moduleConfigs.find((config) => config.moduleId === activeModule)?.customStatuses ?? [];
  const mobileStatus = selectedMobileStatus && statuses.includes(selectedMobileStatus) ? selectedMobileStatus : statuses[0] ?? '';
  const syncLabel = syncStatus === 'synced' ? '已同步至雲端' : syncStatus === 'syncing' ? '同步中…' : syncStatus === 'conflict' ? '偵測到同步衝突' : '同步失敗';
  const syncColor = syncStatus === 'synced' ? 'text-emerald-400' : syncStatus === 'syncing' ? 'text-amber-300' : 'text-rose-400';
  const lastSyncedLabel = lastSyncedAt ? new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSyncedAt)) : null;
  const selectedTask = project.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const createTask = (status: string) => {
    const title = newTaskTitle.trim();
    if (!title) return;
    if (project.projectType === 'shortVideoEditing') {
      const input = window.prompt(`此短影音要建立收入項目嗎？\n輸入單支收入金額（專案預設 ${project.defaultUnitPrice || 1000}）；清空或取消則只建立任務。`, String(project.defaultUnitPrice || 1000));
      const amount = input?.trim() ? Number(input) : undefined;
      addTask(title, activeModule, status, amount !== undefined && Number.isFinite(amount) && amount >= 0 ? 'income' : undefined, amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : undefined);
    } else if (project.projectType === 'programPlanning') {
      const input = window.prompt('此節目企劃任務要連動建立收入嗎？\n輸入收入金額；清空或取消則只建立任務與連動成本。', '');
      const amount = input?.trim() ? Number(input) : undefined;
      addTask(title, activeModule, status, undefined, undefined, amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : undefined);
    } else addTask(title, activeModule, status);
    setNewTaskTitle('');
    setAddingStatus(null);
  };
  const confirmDeleteTask = (taskTitle: string, taskId: string) => {
    if (window.confirm(`確定要刪除任務「${taskTitle}」嗎？若有連動財務任務也會一併刪除。`)) {
      deleteTask(taskId);
      setSelectedTaskId((current) => current === taskId ? null : current);
    }
  };
  const rename = () => {
    const nextName = window.prompt('輸入新的專案名稱', project.name);
    if (nextName === null) return;
    if (!renameProject(nextName)) window.alert('專案名稱不可為空白');
  };
  const changeTemplate = (nextType: ProjectType) => {
    if (nextType !== project.projectType && window.confirm(`確定切換為「${PROJECT_TYPES.find((type) => type.id === nextType)?.name}」嗎？\n原有任務會保留，不相容狀態會移至新流程第一個狀態。`)) updateProjectTemplate(nextType);
  };

  return <main className="project-board min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-7xl">
    <header className="project-board__header mb-6 flex items-center gap-4 border-b border-slate-800 pb-6"><button onClick={onBack} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">← 返回大廳</button><div><div className="project-board__title-row flex items-center gap-3"><h1 className="text-2xl font-black">{project.name}</h1><button onClick={rename} className="text-xs text-indigo-400 hover:text-indigo-300">重新命名</button><label className="text-xs text-slate-400">工作模板<select value={project.projectType} onChange={(event) => changeTemplate(event.target.value as ProjectType)} className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">{PROJECT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label></div><div className="mt-1 flex items-center gap-2 text-xs"><span className={syncColor}>{syncLabel}{syncStatus === 'synced' && lastSyncedLabel ? ` · ${lastSyncedLabel}` : ''}</span>{syncStatus === 'error' && <button onClick={() => void retrySync()} className="text-indigo-400 hover:text-indigo-300">重新同步</button>}</div></div></header>
    <ProjectWorkspaceNavigation activeModule={activeModule} onChange={(moduleId) => { setActiveModule(moduleId); setAddingStatus(null); }} />
    {syncStatus === 'conflict' && <section role="alert" className="mb-6 rounded-xl border border-rose-700 bg-rose-950/40 p-4"><h2 className="font-bold text-rose-200">雲端資料已在其他裝置更新</h2><p className="mt-1 text-xs text-rose-200/80">{syncError}。請選擇要使用哪個版本。</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void resolveConflict('cloud')} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold">載入雲端版本</button><button onClick={() => void resolveConflict('local')} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold">保留本機版本並覆寫</button></div></section>}
    <ProjectSummary completionRate={completionRate} completedCount={completedTasks.length} totalCount={productionTasks.length} modules={moduleSummaries} />
    <ProjectSettlementPanel project={project} updateDefaultUnitPrice={updateDefaultUnitPrice} closeMonth={closeMonth} updateSettlementBatch={updateSettlementBatch} reopenSettlementBatch={reopenSettlementBatch} />
    <section className="project-task-board space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">{WORKSPACE_MODULES.find((module) => module.id === activeModule)?.name}</h2><p className="mt-1 hidden text-xs text-slate-400 md:block">拖曳任務卡到其他欄位，或使用卡片內的狀態選單調整流程。</p><p className="mt-1 text-xs text-slate-400 md:hidden">從下方選擇流程階段；任務卡內也可直接變更狀態。</p></div></div>
      <label className="block rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs font-bold text-slate-300 md:hidden">目前流程階段<select value={mobileStatus} onChange={(event) => { setSelectedMobileStatus(event.target.value); setAddingStatus(null); }} className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base font-semibold text-white">{statuses.map((status) => <option key={status} value={status}>{status}（{project.tasks.filter((task) => task.moduleId === activeModule && task.status === status && !task.archivedAt).length}）</option>)}</select></label>
      <div className="project-status-columns grid gap-4 md:grid-cols-3">{statuses.map((status) => { const tasks = project.tasks.filter((task) => task.moduleId === activeModule && task.status === status && !task.archivedAt); return <section key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedTaskId) updateTask(draggedTaskId, { status }); setDraggedTaskId(null); }} className={`${status === mobileStatus ? 'flex' : 'hidden'} min-h-[420px] flex-col rounded-xl border p-4 transition-colors md:flex md:min-h-[500px] ${draggedTaskId ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-slate-800 bg-slate-900/20'}`}><header className="mb-4 flex justify-between border-b border-slate-800 pb-2 text-xs font-bold text-slate-400"><span>{status}</span><span>{tasks.length}</span></header><div className="flex-1 space-y-2">{tasks.map((task) => <article key={task.id} draggable onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)} onClick={() => setSelectedTaskId(task.id)} className="group cursor-grab rounded-lg border border-slate-800 bg-slate-900 p-3 active:cursor-grabbing"><div className="flex items-start gap-2"><span title="拖曳任務" className="cursor-grab select-none text-slate-600 group-active:cursor-grabbing">⋮⋮</span><input defaultValue={task.title} onClick={(event) => event.stopPropagation()} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== task.title) updateTask(task.id, { title }); }} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} aria-label={`任務名稱：${task.title}`} className="min-w-0 flex-1 bg-transparent text-sm" /><button onClick={(event) => { event.stopPropagation(); confirmDeleteTask(task.title, task.id); }} aria-label={`刪除任務 ${task.title}`} className="rounded p-1 text-rose-400 opacity-0 transition-opacity hover:bg-rose-400/10 group-hover:opacity-100 focus:opacity-100">×</button></div>{task.assignee && <p className="mt-2 text-xs text-slate-400">負責人：{task.assignee}</p>}{task.dueDate && <p className="mt-1 text-xs text-amber-300">截止：{task.dueDate}</p>}<label onClick={(event) => event.stopPropagation()} className="mt-3 block border-t border-slate-800 pt-3 text-xs text-slate-400">任務狀態<select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200">{statuses.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></article>)}{tasks.length === 0 && <p className="py-12 text-center text-xs text-slate-600">此階段尚無任務，可從下方新增</p>}</div>{addingStatus === status ? <form onSubmit={(event) => { event.preventDefault(); createTask(status); }} className="mt-3 space-y-2"><input autoFocus value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder={`新增至「${status}」`} aria-label={`新增至 ${status}`} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><div className="flex gap-2"><button type="submit" disabled={!newTaskTitle.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold disabled:opacity-50">新增</button><button type="button" onClick={() => { setAddingStatus(null); setNewTaskTitle(''); }} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">取消</button></div></form> : <button onClick={() => { setAddingStatus(status); setNewTaskTitle(''); }} className="mt-3 w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-indigo-400 hover:text-indigo-300">＋ 新增任務</button>}</section>; })}</div>
    </section>
    {selectedTask && <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-900 p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs text-indigo-400">任務詳情</p><h2 className="mt-1 text-xl font-black">{selectedTask.title}</h2></div><button onClick={() => setSelectedTaskId(null)} aria-label="關閉任務詳情" className="rounded p-2 text-slate-400 hover:bg-slate-800">×</button></div><div className="space-y-5"><label className="block text-sm font-semibold">任務名稱<input defaultValue={selectedTask.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== selectedTask.title) updateTask(selectedTask.id, { title }); }} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">詳細敘述<textarea defaultValue={selectedTask.description ?? ''} onBlur={(event) => updateTask(selectedTask.id, { description: event.target.value.trim() || undefined })} rows={5} placeholder="記錄拍攝需求、交付規格或工作備註…" className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">負責人<input defaultValue={selectedTask.assignee ?? ''} onBlur={(event) => updateTask(selectedTask.id, { assignee: event.target.value.trim() || undefined })} placeholder="例如：導演、剪輯師" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">截止日期<input type="date" defaultValue={selectedTask.dueDate ?? ''} onChange={(event) => updateTask(selectedTask.id, { dueDate: event.target.value || undefined })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">單支計價<input type="number" min="0" defaultValue={selectedTask.unitPrice ?? project.defaultUnitPrice} onBlur={(event) => updateTask(selectedTask.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal text-emerald-300" /><span className="mt-1 block text-xs font-normal text-slate-500">留用專案預設價格，或在這支影片個別調整。</span></label>{selectedTask.deliveredAt && <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-400">交付日：{selectedTask.deliveredAt.slice(0, 10)}</p>}<label className="block text-sm font-semibold">任務狀態<select value={selectedTask.status} onChange={(event) => updateTask(selectedTask.id, { status: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></aside>}
  </div></main>;
}
