'use client';

import { useEffect, useRef, useState } from 'react';
import { ClientDashboard } from '@/app/client-dashboard';
import { ProjectFinancePanel } from '@/app/project-finance-panel';
import { useProjectData } from '@/hooks/useProjectData';
import { projectApi } from '@/lib/client/project-api';
import { cleanProjectData, createProjectData } from '@/lib/project-data';
import { ModuleId, PROJECT_TYPES, ProjectListItem, ProjectType, WORKSPACE_MODULES } from '@/types/project';

const isProjectId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
type SessionUser = { id: string; email?: string };

function projectListItem(project: ReturnType<typeof createProjectData>, updatedAt = new Date().toISOString()): ProjectListItem {
  const financeTasks = project.tasks.filter((task) => task.moduleId === 'Finance');
  const outstandingPayable = financeTasks.filter((task) => task.transactionType !== 'income' && !task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const outstandingReceivable = financeTasks.filter((task) => task.transactionType === 'income' && !task.isPaid).reduce((sum, task) => sum + task.amount, 0) + project.monthlySettlements.filter((settlement) => settlement.status !== 'paid').reduce((sum, settlement) => sum + settlement.deliveredCount * settlement.unitPrice, 0);
  return { id: project.id, name: project.name, clientId: null, clientName: null, updated_at: updatedAt, taskCount: project.tasks.length, outstandingAmount: outstandingPayable, outstandingReceivable, outstandingPayable };
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function LegacyHome() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [pendingDeletion, setPendingDeletion] = useState<ProjectListItem | null>(null);
  const deletionTimer = useRef<number | null>(null);

  useEffect(() => {
    void projectApi.session().then(setUser).catch(() => setUser(null)).finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (activeProjectId || !user) return;
    let cancelled = false;

    async function loadProjects() {
      const projectMap = new Map<string, ProjectListItem>();
      for (let index = 0; index < localStorage.length; index += 1) {
        const id = localStorage.key(index);
        if (!id || !isProjectId(id)) continue;
        try {
          const raw = localStorage.getItem(id);
          const project = raw ? cleanProjectData(JSON.parse(raw), id) : null;
          if (project) projectMap.set(id, projectListItem(project));
        } catch {
          localStorage.removeItem(id);
        }
      }

      try {
        const cloudProjects = await projectApi.list();
        cloudProjects.forEach((project) => projectMap.set(project.id, project));
      } catch { /* Offline mode keeps local projects. */ }
      if (!cancelled) {
        setProjects([...projectMap.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
        setLoading(false);
      }
    }

    void loadProjects();
    return () => { cancelled = true; };
  }, [activeProjectId, user]);

  useEffect(() => () => {
    if (deletionTimer.current) window.clearTimeout(deletionTimer.current);
  }, []);

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const project = createProjectData(id, name);
    localStorage.setItem(id, JSON.stringify(project));
    try { await projectApi.save(project); } catch { /* Offline mode keeps local data. */ }
    setNewProjectName('');
    setActiveProjectId(id);
  };

  const permanentlyDeleteProject = (project: ProjectListItem) => {
    localStorage.removeItem(project.id);
    void projectApi.remove(project.id);
  };

  const deleteProject = (project: ProjectListItem) => {
    if (!confirm(`確定要刪除「${project.name}」嗎？你可在 6 秒內復原。`)) return;
    if (pendingDeletion) {
      if (deletionTimer.current) window.clearTimeout(deletionTimer.current);
      permanentlyDeleteProject(pendingDeletion);
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setPendingDeletion(project);
    deletionTimer.current = window.setTimeout(() => {
      permanentlyDeleteProject(project);
      setPendingDeletion((current) => current?.id === project.id ? null : current);
      deletionTimer.current = null;
    }, 6000);
  };

  const restoreProject = () => {
    if (!pendingDeletion) return;
    if (deletionTimer.current) window.clearTimeout(deletionTimer.current);
    deletionTimer.current = null;
    setProjects((current) => [...current, pendingDeletion].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setPendingDeletion(null);
  };

  if (sessionLoading) return <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">登入狀態確認中…</main>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  if (activeProjectId) return <ProjectBoard projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />;
  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-12">
    <div className="mx-auto max-w-5xl">
      <header className="mb-10 flex items-start justify-between border-b border-slate-800 pb-7">
        <div><h1 className="text-4xl font-black text-indigo-400">🎬 影視製片控制台</h1><p className="mt-2 text-sm text-slate-400">專案、製作進度與款項管理</p></div>
        <div className="text-right text-xs text-slate-400"><p>{user?.email}</p><button onClick={() => void projectApi.signOut().finally(() => { setProjects([]); setUser(null); })} className="mt-2 text-rose-400 hover:text-rose-300">登出</button></div>
      </header>
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row">
        <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void createProject()} placeholder="輸入新的影視專案名稱" className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
        <button onClick={() => void createProject()} className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold hover:bg-indigo-500">建立新專案</button>
      </div>
      <h2 className="mb-4 text-lg font-bold">專案看板 ({projects.length})</h2>
      {loading ? <p className="py-12 text-center text-slate-500">資料載入中…</p> : projects.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">尚無專案，請從上方建立。</p> :
        <div className="grid gap-4 md:grid-cols-2">{projects.map((project) => <article key={project.id} onClick={() => setActiveProjectId(project.id)} className="flex cursor-pointer items-start justify-between rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-indigo-500">
          <div><h3 className="text-lg font-bold">{project.name}</h3><p className="mt-1 text-xs text-slate-500">最近更新：{formatUpdatedAt(project.updated_at)}</p><p className="mt-3 text-xs text-slate-400">{project.taskCount} 項任務 · 待支付 NT$ {project.outstandingAmount.toLocaleString()}</p></div>
          <button onClick={(event) => { event.stopPropagation(); deleteProject(project); }} aria-label={`刪除 ${project.name}`} className="rounded-lg p-2 text-slate-500 hover:text-rose-400">🗑️</button>
        </article>)}</div>}
    </div>
    {pendingDeletion && <div className="fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm shadow-xl"><span>已刪除「{pendingDeletion.name}」</span><button onClick={restoreProject} className="font-bold text-indigo-400 hover:text-indigo-300">復原</button></div>}
  </main>;
}

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
  return <ClientDashboard userEmail={user.email} onOpenProject={setActiveProjectId} onSignOut={() => void projectApi.signOut().finally(() => setUser(null))} />;
}

// Keeps the prior dashboard implementation available while the client-first view is rolled out.
void LegacyHome;

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
  const { project, loading, syncStatus, lastSyncedAt, retrySync, renameProject, updateBudget, addMonthlySettlement, updateMonthlySettlement, deleteMonthlySettlement, updateProjectTemplate, addTask, deleteTask, updateTask } = useProjectData(projectId);
  const [activeModule, setActiveModule] = useState<ModuleId>('Scripting');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingStatus, setAddingStatus] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedMobileStatus, setSelectedMobileStatus] = useState<string | null>(null);
  if (loading || !project) return <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">專案載入中…</main>;
  if (activeModule === ('Finance' as ModuleId)) return <ProjectFinancePanel project={project} updateBudget={updateBudget} addMonthlySettlement={addMonthlySettlement} updateMonthlySettlement={updateMonthlySettlement} deleteMonthlySettlement={deleteMonthlySettlement} deleteTask={deleteTask} updateTask={updateTask} addTask={addTask} onBackToTasks={() => setActiveModule('Scripting')} />;

  const productionModules = WORKSPACE_MODULES.filter((module) => module.id !== 'Finance');
  const productionTasks = project.tasks.filter((task) => task.moduleId !== 'Finance');
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
  const syncLabel = syncStatus === 'synced' ? '已同步至雲端' : syncStatus === 'syncing' ? '同步中…' : '同步失敗';
  const syncColor = syncStatus === 'synced' ? 'text-emerald-400' : syncStatus === 'syncing' ? 'text-amber-300' : 'text-rose-400';
  const lastSyncedLabel = lastSyncedAt ? new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSyncedAt)) : null;
  const selectedTask = project.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const createTask = (status: string) => {
    const title = newTaskTitle.trim();
    if (!title) return;
    if (project.projectType === 'shortVideoEditing') {
      const input = window.prompt('此短影音要建立收入項目嗎？\n輸入單支收入金額（預設 1000）；清空或取消則只建立任務。', '1000');
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
    <nav aria-label="專案功能" className="project-workspace-nav sticky top-0 z-10 mb-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-950/95 p-2 shadow-lg backdrop-blur lg:static lg:max-w-md">{WORKSPACE_MODULES.map((module) => <button key={module.id} onClick={() => { setActiveModule(module.id); setAddingStatus(null); }} className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${activeModule === module.id ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{module.name}</button>)}</nav>
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">專案摘要</h2><p className="mt-1 text-xs text-slate-400">製作任務完成度與各階段進度</p></div><div className="text-left sm:text-right"><p className="text-2xl font-black text-indigo-400">{completionRate}%</p><p className="text-xs text-slate-400">{completedTasks.length} / {productionTasks.length} 項製作任務已完成</p></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${completionRate}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{moduleSummaries.map((module) => <div key={module.id} className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-400">{module.name}</p><p className="mt-1 text-sm font-bold">{module.completed} / {module.total} 已完成</p></div>)}</div></section>
    <section className="project-task-board space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">{WORKSPACE_MODULES.find((module) => module.id === activeModule)?.name}</h2><p className="mt-1 hidden text-xs text-slate-400 md:block">拖曳任務卡到其他欄位，或使用卡片內的狀態選單調整流程。</p><p className="mt-1 text-xs text-slate-400 md:hidden">從下方選擇流程階段；任務卡內也可直接變更狀態。</p></div></div>
      <label className="block rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs font-bold text-slate-300 md:hidden">目前流程階段<select value={mobileStatus} onChange={(event) => { setSelectedMobileStatus(event.target.value); setAddingStatus(null); }} className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base font-semibold text-white">{statuses.map((status) => <option key={status} value={status}>{status}（{project.tasks.filter((task) => task.moduleId === activeModule && task.status === status).length}）</option>)}</select></label>
      <div className="project-status-columns grid gap-4 md:grid-cols-3">{statuses.map((status) => { const tasks = project.tasks.filter((task) => task.moduleId === activeModule && task.status === status); return <section key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedTaskId) updateTask(draggedTaskId, { status }); setDraggedTaskId(null); }} className={`${status === mobileStatus ? 'flex' : 'hidden'} min-h-[420px] flex-col rounded-xl border p-4 transition-colors md:flex md:min-h-[500px] ${draggedTaskId ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-slate-800 bg-slate-900/20'}`}><header className="mb-4 flex justify-between border-b border-slate-800 pb-2 text-xs font-bold text-slate-400"><span>{status}</span><span>{tasks.length}</span></header><div className="flex-1 space-y-2">{tasks.map((task) => <article key={task.id} draggable onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)} onClick={() => setSelectedTaskId(task.id)} className="group cursor-grab rounded-lg border border-slate-800 bg-slate-900 p-3 active:cursor-grabbing"><div className="flex items-start gap-2"><span title="拖曳任務" className="cursor-grab select-none text-slate-600 group-active:cursor-grabbing">⋮⋮</span><input defaultValue={task.title} onClick={(event) => event.stopPropagation()} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== task.title) updateTask(task.id, { title }); }} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} aria-label={`任務名稱：${task.title}`} className="min-w-0 flex-1 bg-transparent text-sm" /><button onClick={(event) => { event.stopPropagation(); confirmDeleteTask(task.title, task.id); }} aria-label={`刪除任務 ${task.title}`} className="rounded p-1 text-rose-400 opacity-0 transition-opacity hover:bg-rose-400/10 group-hover:opacity-100 focus:opacity-100">×</button></div>{task.assignee && <p className="mt-2 text-xs text-slate-400">負責人：{task.assignee}</p>}{task.dueDate && <p className="mt-1 text-xs text-amber-300">截止：{task.dueDate}</p>}<label onClick={(event) => event.stopPropagation()} className="mt-3 block border-t border-slate-800 pt-3 text-xs text-slate-400">任務狀態<select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200">{statuses.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></article>)}{tasks.length === 0 && <p className="py-12 text-center text-xs text-slate-600">此階段尚無任務，可從下方新增</p>}</div>{addingStatus === status ? <form onSubmit={(event) => { event.preventDefault(); createTask(status); }} className="mt-3 space-y-2"><input autoFocus value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder={`新增至「${status}」`} aria-label={`新增至 ${status}`} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><div className="flex gap-2"><button type="submit" disabled={!newTaskTitle.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold disabled:opacity-50">新增</button><button type="button" onClick={() => { setAddingStatus(null); setNewTaskTitle(''); }} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">取消</button></div></form> : <button onClick={() => { setAddingStatus(status); setNewTaskTitle(''); }} className="mt-3 w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-indigo-400 hover:text-indigo-300">＋ 新增任務</button>}</section>; })}</div>
    </section>
    {selectedTask && <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-900 p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs text-indigo-400">任務詳情</p><h2 className="mt-1 text-xl font-black">{selectedTask.title}</h2></div><button onClick={() => setSelectedTaskId(null)} aria-label="關閉任務詳情" className="rounded p-2 text-slate-400 hover:bg-slate-800">×</button></div><div className="space-y-5"><label className="block text-sm font-semibold">任務名稱<input defaultValue={selectedTask.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== selectedTask.title) updateTask(selectedTask.id, { title }); }} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">詳細敘述<textarea defaultValue={selectedTask.description ?? ''} onBlur={(event) => updateTask(selectedTask.id, { description: event.target.value.trim() || undefined })} rows={5} placeholder="記錄拍攝需求、交付規格或工作備註…" className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">負責人<input defaultValue={selectedTask.assignee ?? ''} onBlur={(event) => updateTask(selectedTask.id, { assignee: event.target.value.trim() || undefined })} placeholder="例如：導演、剪輯師" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">截止日期<input type="date" defaultValue={selectedTask.dueDate ?? ''} onChange={(event) => updateTask(selectedTask.id, { dueDate: event.target.value || undefined })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">任務狀態<select value={selectedTask.status} onChange={(event) => updateTask(selectedTask.id, { status: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-normal">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></aside>}
  </div></main>;
}
