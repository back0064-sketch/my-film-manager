'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ClientDashboard, type DashboardSection } from '@/app/client-dashboard';
import { SyncConflictPanel } from '@/app/sync-conflict-panel';
import { ProjectSummary, ProjectWorkspaceNavigation } from '@/app/project-overview';
import { useProjectData } from '@/hooks/useProjectData';
import { projectApi } from '@/lib/client/project-api';
import { clearLocalProjectCache } from '@/lib/client/project-cache';
import { ModuleId, PROJECT_TYPES, ProjectDestination, ProjectType, WORKSPACE_MODULES } from '@/types/project';

type SessionUser = { id: string; email?: string };

const ProjectFinancePanel = dynamic(
  () => import('@/app/project-finance-panel').then((module) => module.ProjectFinancePanel),
  { loading: () => <main className="min-h-screen bg-work-canvas p-12 text-center text-work-muted">財務資料載入中…</main> },
);

const ProjectSettlementPanel = dynamic(
  () => import('@/app/project-settlement-panel').then((module) => module.ProjectSettlementPanel),
  { loading: () => <section className="mb-6 rounded-2xl border border-work-line bg-work-surface p-5 text-sm text-work-muted">月結資料載入中…</section> },
);

export default function Home() {
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('work');
  const [activeProject, setActiveProject] = useState<{ id: string; destination?: ProjectDestination } | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [mfaCheckedUserId, setMfaCheckedUserId] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState<{ userId: string; factorId: string } | null>(null);
  const [mfaCheckError, setMfaCheckError] = useState<string | null>(null);

  useEffect(() => {
    void projectApi.session().then(setUser).catch(() => setUser(null)).finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    void projectApi.mfaStatus().then((status) => {
      const factor = status.factors.find((item) => item.status === 'verified');
      setMfaCheckError(null);
      setMfaRequired(status.nextLevel === 'aal2' && factor ? { userId, factorId: factor.id } : null);
    }).catch(() => {
      setMfaRequired(null);
      setMfaCheckError('無法確認帳號安全狀態，請重新登入。');
    }).finally(() => setMfaCheckedUserId(userId));
  }, [user]);

  if (sessionLoading) return <main className="min-h-screen bg-work-canvas p-12 text-center text-work-muted">登入狀態確認中…</main>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  if (mfaCheckedUserId !== user.id) return <main className="min-h-screen bg-work-canvas p-12 text-center text-work-muted">確認帳號安全狀態…</main>;
  if (mfaCheckError) return <SecurityCheckError onSignOut={() => void projectApi.signOut().finally(() => { clearLocalProjectCache(localStorage, user.id); setMfaCheckedUserId(null); setMfaRequired(null); setMfaCheckError(null); setUser(null); })} />;
  if (mfaRequired?.userId === user.id) return <MfaChallenge factorId={mfaRequired.factorId} onVerified={() => setMfaRequired(null)} onSignOut={() => void projectApi.signOut().finally(() => { clearLocalProjectCache(localStorage, user.id); setMfaCheckedUserId(null); setMfaRequired(null); setUser(null); })} />;
  if (activeProject) return <ProjectBoard projectId={activeProject.id} destination={activeProject.destination} userId={user.id} onBack={() => { setActiveProject(null); window.scrollTo(0, 0); }} />;
  return <ClientDashboard userId={user.id} userEmail={user.email}
    section={dashboardSection} onSectionChange={setDashboardSection}
    onOpenProject={(id, destination) => { setActiveProject({ id, destination }); window.scrollTo(0, 0); }}
    onSignOut={() => void projectApi.signOut().finally(() => {
      clearLocalProjectCache(localStorage, user.id);
      setMfaCheckedUserId(null); setMfaRequired(null); setMfaCheckError(null);
      setDashboardSection('work'); setUser(null);
    })} />;
}


function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void projectApi.authOptions().then((options) => { if (active) setGoogleEnabled(options.googleEnabled); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const submit = async () => {
    setPending(true); setMessage('');
    try { onAuthenticated(await projectApi.signIn(email, password)); }
    catch (error) { setMessage(error instanceof Error ? error.message : '登入失敗'); }
    finally { setPending(false); }
  };
  const requestReset = async () => {
    setPending(true); setMessage('');
    try { await projectApi.requestPasswordReset(resetEmail || email); setMessage('如果這個 Email 有建立帳號，重設連結會寄到信箱。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '無法寄出重設信件'); }
    finally { setPending(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-work-canvas p-6 text-work-ink"><section className="auth-card w-full max-w-md p-6 sm:p-8"><h1 className="workspace-heading text-3xl font-semibold text-work-link">🎬 影視製片控制台</h1>{resetMode ? <><p className="mt-2 text-sm text-work-muted">輸入既有帳號的 Email，我們會寄出重設連結。</p><form onSubmit={(event) => { event.preventDefault(); void requestReset(); }} className="mt-6 space-y-4"><input type="email" required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="電子郵件" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-sm" /><button disabled={pending} className="workspace-button workspace-button--primary w-full px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '寄送中…' : '寄送重設連結'}</button></form>{message && <p className="mt-4 text-sm text-work-warning">{message}</p>}<button onClick={() => { setResetMode(false); setMessage(''); }} className="workspace-button mt-6 text-sm px-2 py-1">← 回到登入</button></> : <><p className="mt-2 text-sm text-work-muted">此控制台為私人單人使用，請以既有帳號登入。</p>{googleEnabled && <a href="/api/auth/google" className="workspace-button mt-6 block w-full px-4 py-3 text-center text-sm font-bold">使用 Google 帳號登入</a>}<form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-6 space-y-4"><input type="email" required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="電子郵件" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-sm" /><input type="password" required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密碼" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-sm" /><button disabled={pending} className="workspace-button workspace-button--primary w-full px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '登入中…' : '登入'}</button></form><button onClick={() => { setResetEmail(email); setResetMode(true); setMessage(''); }} className="workspace-button mt-4 text-sm px-2 py-1">忘記密碼？</button>{message && <p className="mt-4 text-sm text-work-warning">{message}</p>}</>}</section></main>;
}

function SecurityCheckError({ onSignOut }: { onSignOut: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-work-canvas p-6 text-work-ink"><section className="auth-card w-full max-w-md p-6 sm:p-8"><h1 className="workspace-heading text-2xl font-semibold text-work-danger">無法確認帳號安全狀態</h1><p className="mt-3 text-sm text-work-muted">為保護你的資料，系統暫停進入工作台。請重新登入；若仍持續發生，檢查 Supabase Auth 狀態。</p><button onClick={onSignOut} className="workspace-button workspace-button--primary mt-6 w-full px-4 py-3 text-sm font-bold">登出並重新登入</button></section></main>;
}

function MfaChallenge({ factorId, onVerified, onSignOut }: { factorId: string; onVerified: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('請輸入驗證器 App 顯示的 6 位數代碼。');
  const [pending, setPending] = useState(false);
  const verify = async () => {
    setPending(true); setMessage('');
    try { await projectApi.mfaVerify(factorId, code); onVerified(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'MFA 驗證失敗'); }
    finally { setPending(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-work-canvas p-6 text-work-ink"><section className="auth-card w-full max-w-md p-6 sm:p-8"><h1 className="workspace-heading text-2xl font-semibold text-work-link">需要第二層驗證</h1><p className="mt-3 text-sm text-work-muted">{message}</p><form onSubmit={(event) => { event.preventDefault(); void verify(); }} className="mt-6 space-y-4"><input inputMode="numeric" autoFocus required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位數代碼" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-center text-xl tracking-[0.4em]" /><button disabled={pending || code.length !== 6} className="workspace-button workspace-button--primary w-full px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '驗證中…' : '驗證並進入工作台'}</button></form><button type="button" onClick={onSignOut} className="workspace-button workspace-button--danger mt-6 text-sm px-2 py-1">登出並改用其他帳號</button></section></main>;
}

function ProjectBoard({ projectId, userId, onBack, destination }: { projectId: string; userId: string; onBack: () => void; destination?: ProjectDestination }) {
  const { project, loading, syncStatus, syncError, syncConflict, lastSyncedAt, retrySync, resolveConflict, renameProject, updateBudget, updateDefaultUnitPrice, closeMonth, setDeliveryDate, recordCoveredDelivery, updateSettlementBatch, reopenSettlementBatch, withdrawInvoice, addMonthlySettlement, updateMonthlySettlement, deleteMonthlySettlement, updateProjectTemplate, addTask, deleteTask, updateTask, updatePlannedCloseDate, setTaskWaiting } = useProjectData(projectId, userId);
  const [activeModule, setActiveModule] = useState<ModuleId>(destination?.moduleId ?? 'Scripting');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingStatus, setAddingStatus] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(destination?.taskId ?? null);
  const [selectedMobileStatus, setSelectedMobileStatus] = useState<string | null>(null);
  if (loading || !project) return <main className="min-h-screen bg-work-canvas p-12 text-center text-work-muted">專案載入中…</main>;

  const syncLabel = syncStatus === 'synced' ? '已同步至雲端' : syncStatus === 'syncing' ? '同步中…' : syncStatus === 'conflict' ? '偵測到同步衝突' : '同步失敗';
  const syncColor = syncStatus === 'synced' ? 'text-work-positive' : syncStatus === 'syncing' ? 'text-work-warning' : 'text-work-danger';
  const lastSyncedLabel = lastSyncedAt ? new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSyncedAt)) : null;
  const syncFeedback = <div className="mt-1 flex items-center gap-2 text-xs"><span className={syncColor}>{syncLabel}{syncStatus === 'synced' && lastSyncedLabel ? ` · ${lastSyncedLabel}` : ''}</span>{syncStatus === 'error' && <button onClick={() => void retrySync()} className="workspace-button px-2 py-1">重新同步</button>}</div>;
  const conflictFeedback = syncStatus === 'conflict' && syncConflict && <SyncConflictPanel conflict={syncConflict} message={syncError} onResolve={(choice) => void resolveConflict(choice)} />;
  if (activeModule === 'Finance') return <ProjectFinancePanel project={project} updateBudget={updateBudget} addMonthlySettlement={addMonthlySettlement} updateMonthlySettlement={updateMonthlySettlement} deleteMonthlySettlement={deleteMonthlySettlement} deleteTask={deleteTask} updateTask={updateTask} updateSettlementBatch={updateSettlementBatch} addTask={addTask} onBackToTasks={() => setActiveModule('Scripting')} onBack={onBack} syncFeedback={syncFeedback} conflictFeedback={conflictFeedback} saving={syncStatus === 'syncing'} />;

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
  const selectedTask = productionTasks.find((task) => task.id === selectedTaskId) ?? null;
  const waiting = new Set(project.waitingForClientTaskIds);
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

  return <main className="project-board min-h-screen bg-work-canvas p-4 text-work-ink md:p-8"><div className="mx-auto max-w-[100rem]">
    <header className="workspace-header project-board__header mb-6 flex items-center gap-4"><button onClick={onBack} disabled={syncStatus === 'syncing'} className="workspace-button px-3 py-1.5 text-xs disabled:opacity-50">← 返回大廳</button><div><div className="project-board__title-row flex items-center gap-3"><h1 className="workspace-heading font-semibold">{project.name}</h1><button onClick={rename} className="workspace-button text-xs px-2 py-1">重新命名</button><label className="text-xs text-work-muted">工作模板<select value={project.projectType} onChange={(event) => changeTemplate(event.target.value as ProjectType)} className="ml-2 rounded border border-work-control bg-work-surface px-2 py-1 text-xs text-work-ink">{PROJECT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label></div>{syncFeedback}</div></header>
    <ProjectWorkspaceNavigation activeModule={activeModule} onChange={(moduleId) => { setActiveModule(moduleId); setAddingStatus(null); }} />
    {conflictFeedback}
    <ProjectSummary completionRate={completionRate} completedCount={completedTasks.length} totalCount={productionTasks.length} modules={moduleSummaries} plannedCloseDate={project.plannedCloseDate} onPlannedCloseDateChange={updatePlannedCloseDate} />
    <ProjectSettlementPanel project={project} updateDefaultUnitPrice={updateDefaultUnitPrice} closeMonth={closeMonth} updateSettlementBatch={updateSettlementBatch} reopenSettlementBatch={reopenSettlementBatch} withdrawInvoice={withdrawInvoice} setDeliveryDate={setDeliveryDate} recordCoveredDelivery={recordCoveredDelivery} />
    <section className="project-task-board space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">{WORKSPACE_MODULES.find((module) => module.id === activeModule)?.name}</h2><p className="mt-1 hidden text-xs text-work-muted md:block">拖曳任務卡到其他欄位，或使用卡片內的狀態選單調整流程。</p><p className="mt-1 text-xs text-work-muted md:hidden">從下方選擇流程階段；任務卡內也可直接變更狀態。</p></div></div>
      <label className="block rounded-xl border border-work-control bg-work-surface p-3 text-xs font-bold text-work-muted md:hidden">目前流程階段<select value={mobileStatus} onChange={(event) => { setSelectedMobileStatus(event.target.value); setAddingStatus(null); }} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-3 text-base font-semibold text-work-ink">{statuses.map((status) => <option key={status} value={status}>{status}（{project.tasks.filter((task) => task.moduleId === activeModule && task.status === status && !task.archivedAt).length}）</option>)}</select></label>
      <div className="project-status-columns grid gap-4 md:grid-cols-3">{statuses.map((status) => { const tasks = project.tasks.filter((task) => task.moduleId === activeModule && task.status === status && !task.archivedAt); return <section key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedTaskId) updateTask(draggedTaskId, { status }); setDraggedTaskId(null); }} className={`${status === mobileStatus ? 'flex' : 'hidden'} min-h-[420px] flex-col rounded-xl border p-4 transition-colors md:flex md:min-h-[500px] ${draggedTaskId ? 'border-work-link bg-work-selected' : 'border-work-line bg-work-surface'}`}><header className="mb-4 flex justify-between border-b border-work-line pb-2 text-xs font-bold text-work-muted"><span>{status}</span><span>{tasks.length}</span></header><div className="flex-1 space-y-2">{tasks.map((task) => <article key={task.id} draggable onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)} onClick={() => setSelectedTaskId(task.id)} className="group cursor-grab rounded-lg border border-work-line bg-work-surface p-3 active:cursor-grabbing"><div className="flex items-start gap-2"><span title="拖曳任務" className="cursor-grab select-none text-work-muted group-active:cursor-grabbing">⋮⋮</span><input defaultValue={task.title} onClick={(event) => event.stopPropagation()} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== task.title) updateTask(task.id, { title }); }} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} aria-label={`任務名稱：${task.title}`} className="min-w-0 flex-1 bg-transparent text-sm" /><button onClick={(event) => { event.stopPropagation(); confirmDeleteTask(task.title, task.id); }} aria-label={`刪除任務 ${task.title}`} className="workspace-button workspace-button--danger p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 px-2 py-1">×</button></div>{waiting.has(task.id) && status !== statuses.at(-1) && <p className="mt-2 text-xs text-work-link">等客戶回覆</p>}{task.assignee && <p className="mt-2 text-xs text-work-muted">負責人：{task.assignee}</p>}{task.dueDate && <p className="mt-1 text-xs text-work-warning">截止：{task.dueDate}</p>}<label onClick={(event) => event.stopPropagation()} className="mt-3 block border-t border-work-line pt-3 text-xs text-work-muted">任務狀態<select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })} className="mt-1 w-full rounded border border-work-control bg-work-paper px-2 py-1.5 text-sm text-work-ink">{statuses.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></article>)}{tasks.length === 0 && <p className="py-12 text-center text-xs text-work-muted">此階段尚無任務，可從下方新增</p>}</div>{addingStatus === status ? <form onSubmit={(event) => { event.preventDefault(); createTask(status); }} className="mt-3 space-y-2"><input autoFocus value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder={`新增至「${status}」`} aria-label={`新增至 ${status}`} className="w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm" /><div className="flex gap-2"><button type="submit" disabled={!newTaskTitle.trim()} className="workspace-button workspace-button--primary px-3 py-1.5 text-xs font-bold disabled:opacity-50">新增</button><button type="button" onClick={() => { setAddingStatus(null); setNewTaskTitle(''); }} className="workspace-button px-3 py-1.5 text-xs">取消</button></div></form> : <button onClick={() => { setAddingStatus(status); setNewTaskTitle(''); }} className="workspace-button mt-3 w-full px-3 py-2 text-sm">＋ 新增任務</button>}</section>; })}</div>
    </section>
    {selectedTask && <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-work-control bg-work-surface p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs text-work-link">任務詳情</p><h2 className="mt-1 text-xl font-black">{selectedTask.title}</h2></div><button onClick={() => setSelectedTaskId(null)} aria-label="關閉任務詳情" className="workspace-button p-2 px-2 py-1">×</button></div><div className="space-y-5"><label className="block text-sm font-semibold">任務名稱<input defaultValue={selectedTask.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== selectedTask.title) updateTask(selectedTask.id, { title }); }} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">詳細敘述<textarea defaultValue={selectedTask.description ?? ''} onBlur={(event) => updateTask(selectedTask.id, { description: event.target.value.trim() || undefined })} rows={5} placeholder="記錄拍攝需求、交付規格或工作備註…" className="mt-2 w-full resize-y rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">負責人<input defaultValue={selectedTask.assignee ?? ''} onBlur={(event) => updateTask(selectedTask.id, { assignee: event.target.value.trim() || undefined })} placeholder="例如：導演、剪輯師" className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">截止日期<input type="date" defaultValue={selectedTask.dueDate ?? ''} onChange={(event) => updateTask(selectedTask.id, { dueDate: event.target.value || undefined })} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={waiting.has(selectedTask.id)} onChange={(event) => setTaskWaiting(selectedTask.id, event.target.checked)} className="size-4 accent-work-primary" />
      等客戶回覆
    </label><label className="block text-sm font-semibold">單支計價<input type="number" min="0" defaultValue={selectedTask.unitPrice ?? project.defaultUnitPrice} onBlur={(event) => updateTask(selectedTask.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal text-work-positive" /><span className="mt-1 block text-xs font-normal text-work-muted">留用專案預設價格，或在這支影片個別調整。</span></label>{selectedTask.deliveredAt && <p className="rounded-lg bg-work-paper px-3 py-2 text-xs text-work-muted">交付日：{selectedTask.deliveredAt.slice(0, 10)}</p>}<label className="block text-sm font-semibold">任務狀態<select value={selectedTask.status} onChange={(event) => updateTask(selectedTask.id, { status: event.target.value })} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></aside>}
  </div></main>;
}
