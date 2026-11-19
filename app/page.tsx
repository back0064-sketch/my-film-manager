'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ClientDashboard, type DashboardSection } from '@/app/client-dashboard';
import { SyncConflictPanel } from '@/app/sync-conflict-panel';
import { AmountInput, AmountToggle, AmountVisibility, useAmountVisibility } from './amount-visibility';
import { ProductionTasks } from './production-tasks';
import { ProjectSummary, ProjectWorkspaceNavigation } from '@/app/project-overview';
import { useProjectData } from '@/hooks/useProjectData';
import { projectApi } from '@/lib/client/project-api';
import { clearLocalProjectCache } from '@/lib/client/project-cache';
import { ModuleId, PROJECT_TYPES, ProjectDestination, ProjectType } from '@/types/project';

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
  if (activeProject) return <AmountVisibility key={user.id}><ProjectBoard projectId={activeProject.id} destination={activeProject.destination} userId={user.id} onBack={() => { setActiveProject(null); window.scrollTo(0, 0); }} /></AmountVisibility>;
  return <AmountVisibility key={user.id}><ClientDashboard userId={user.id} userEmail={user.email}
    section={dashboardSection} onSectionChange={setDashboardSection}
    onOpenProject={(id, destination) => { setActiveProject({ id, destination }); window.scrollTo(0, 0); }}
    onSignOut={() => void projectApi.signOut().finally(() => {
      clearLocalProjectCache(localStorage, user.id);
      setMfaCheckedUserId(null); setMfaRequired(null); setMfaCheckError(null);
      setDashboardSection('work'); setUser(null);
    })} /></AmountVisibility>;
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
  return <main className="flex min-h-screen items-center justify-center bg-work-canvas p-6 text-work-ink"><section className="auth-card w-full max-w-md p-6 sm:p-8"><h1 className="workspace-heading text-3xl font-semibold text-work-link">影視製片控制台</h1>{resetMode ? <><p className="mt-2 text-sm text-work-muted">輸入既有帳號的 Email，我們會寄出重設連結。</p><form onSubmit={(event) => { event.preventDefault(); void requestReset(); }} className="mt-6 space-y-4"><input type="email" required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="電子郵件" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-sm" /><button disabled={pending} className="workspace-button workspace-button--primary w-full px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '寄送中…' : '寄送重設連結'}</button></form>{message && <p className="mt-4 text-sm text-work-warning">{message}</p>}<button onClick={() => { setResetMode(false); setMessage(''); }} className="workspace-button mt-6 text-sm px-2 py-1">← 回到登入</button></> : <><p className="mt-2 text-sm text-work-muted">此控制台為私人單人使用，請以既有帳號登入。</p>{googleEnabled && <a href="/api/auth/google" className="workspace-button mt-6 block w-full px-4 py-3 text-center text-sm font-bold">使用 Google 帳號登入</a>}<form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-6 space-y-4"><input type="email" required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="電子郵件" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-sm" /><input type="password" required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密碼" className="w-full rounded-xl border border-work-control bg-work-paper px-4 py-3 text-sm" /><button disabled={pending} className="workspace-button workspace-button--primary w-full px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '登入中…' : '登入'}</button></form><button onClick={() => { setResetEmail(email); setResetMode(true); setMessage(''); }} className="workspace-button mt-4 text-sm px-2 py-1">忘記密碼？</button>{message && <p className="mt-4 text-sm text-work-warning">{message}</p>}</>}</section></main>;
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
  const { project, loading, syncStatus, syncError, syncConflict, lastSyncedAt, retrySync, resolveConflict, renameProject, updateBudget, updateDefaultUnitPrice, closeMonth, setDeliveryDate, recordCoveredDelivery, updateSettlementBatch, reopenSettlementBatch, withdrawInvoice, updateProjectTemplate, addTask, deleteTask, updateTask, updatePlannedCloseDate, setTaskWaiting } = useProjectData(projectId, userId);
  const [activeModule, setActiveModule] = useState<ModuleId>(destination?.moduleId ?? 'Scripting');
  const { visible: amountsVisible } = useAmountVisibility();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(destination?.taskId ?? null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!selectedTaskId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedTaskId(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedTaskId]);
  if (loading || !project) return <main className="project-board min-h-screen p-4 md:p-8"><header className="workspace-header"><button onClick={onBack} className="workspace-button px-3 py-2">← 返回大廳</button><h1 className="workspace-heading">專案工作區</h1></header><section className="loading-paper" role="status">專案載入中…</section></main>;

  const syncLabel = syncStatus === 'synced' ? '已同步至雲端' : syncStatus === 'syncing' ? '同步中…' : syncStatus === 'conflict' ? '偵測到同步衝突' : '同步失敗';
  const syncColor = syncStatus === 'synced' ? 'text-work-positive' : syncStatus === 'syncing' ? 'text-work-warning' : 'text-work-danger';
  const lastSyncedLabel = lastSyncedAt ? new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSyncedAt)) : null;
  const syncFeedback = <div className="mt-1 flex items-center gap-2 text-xs"><span className={syncColor}>{syncLabel}{syncStatus === 'synced' && lastSyncedLabel ? ` · ${lastSyncedLabel}` : ''}</span>{syncStatus === 'error' && <button onClick={() => void retrySync()} className="workspace-button px-2 py-1">重新同步</button>}</div>;
  const conflictFeedback = syncStatus === 'conflict' && syncConflict && <SyncConflictPanel conflict={syncConflict} message={syncError} onResolve={(choice) => void resolveConflict(choice)} />;
  if (activeModule === 'Finance') return <ProjectFinancePanel
    project={project} updateBudget={updateBudget} deleteTask={deleteTask} updateTask={updateTask} addTask={addTask}
    onBackToTasks={() => setActiveModule('Scripting')} onBack={onBack}
    syncFeedback={syncFeedback} conflictFeedback={conflictFeedback} saving={syncStatus === 'syncing'}
    settlementPanel={<ProjectSettlementPanel project={project} updateDefaultUnitPrice={updateDefaultUnitPrice} closeMonth={closeMonth}
      updateSettlementBatch={updateSettlementBatch} reopenSettlementBatch={reopenSettlementBatch} withdrawInvoice={withdrawInvoice}
      setDeliveryDate={setDeliveryDate} recordCoveredDelivery={recordCoveredDelivery} />} />;

  const productionTasks = project.tasks.filter((task) => task.moduleId !== 'Finance' && !task.archivedAt);
  const activeTasks = productionTasks.filter((task) => {
    const stages = project.moduleConfigs.find((config) => config.moduleId === task.moduleId)?.customStatuses;
    return task.status !== stages?.at(-1);
  });
  const completionRate = productionTasks.length ? Math.round(100 * (productionTasks.length - activeTasks.length) / productionTasks.length) : 0;
  const statuses = project.moduleConfigs.find((config) => config.moduleId === activeModule)?.customStatuses ?? [];
  const selectedTask = productionTasks.find((task) => task.id === selectedTaskId) ?? null;
  const waiting = new Set(project.waitingForClientTaskIds);
  const createTask = (status: string, title: string) => {
    if (!title) return;
    if (project.projectType === 'shortVideoEditing') {
      const input = amountsVisible ? window.prompt(`此短影音要建立收入項目嗎？\n輸入單支收入金額（專案預設 ${project.defaultUnitPrice || 1000}）；清空或取消則只建立任務。`, String(project.defaultUnitPrice || 1000)) : (window.confirm('以專案預設單價建立收入項目？取消可只建立任務。') ? String(project.defaultUnitPrice || 1000) : null);
      const amount = input?.trim() ? Number(input) : undefined;
      addTask(title, activeModule, status, amount !== undefined && Number.isFinite(amount) && amount >= 0 ? 'income' : undefined, amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : undefined);
    } else if (project.projectType === 'programPlanning') {
      const input = window.prompt('此節目企劃任務要連動建立收入嗎？\n輸入收入金額；清空或取消則只建立任務與連動成本。', '');
      const amount = input?.trim() ? Number(input) : undefined;
      addTask(title, activeModule, status, undefined, undefined, amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : undefined);
    } else addTask(title, activeModule, status);
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
    <header className="workspace-header project-head">
      <div><button onClick={onBack} disabled={syncStatus === 'syncing'} className="workspace-button back-link">← 返回大廳</button><h1 className="workspace-heading font-semibold">{project.name}</h1></div>
      <div>{syncFeedback}<details className="project-options"><summary>專案設定</summary><div>
        <button onClick={rename} className="workspace-button px-2 py-1">重新命名</button>
        <label>工作模板<select value={project.projectType} onChange={(event) => changeTemplate(event.target.value as ProjectType)}>{PROJECT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label>預計結案日<input type="date" value={project.plannedCloseDate ?? ''} onChange={(event) => updatePlannedCloseDate(event.target.value)} /></label>
        <label className="density-setting"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />緊湊清單</label>
        <AmountToggle />
      </div></details></div>
    </header>
    {conflictFeedback}
    <ProjectSummary completionRate={completionRate} activeCount={activeTasks.length}
      nextDue={activeTasks.flatMap((task) => task.dueDate ? [task.dueDate] : []).sort()[0]} />
    <ProjectWorkspaceNavigation activeModule={activeModule} onChange={setActiveModule} />
    <ProductionTasks key={activeModule} compact={compact} statuses={statuses} tasks={productionTasks.filter((task) => task.moduleId === activeModule)}
      waiting={waiting} onOpen={setSelectedTaskId} onMove={(id, status) => updateTask(id, { status })} onAdd={createTask} />
    {selectedTask && <aside key={selectedTask.id} className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-work-control bg-work-surface p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs text-work-link">任務詳情</p><h2 className="mt-1 text-xl font-black">{selectedTask.title}</h2></div><button onClick={() => setSelectedTaskId(null)} aria-label="關閉任務詳情" className="workspace-button p-2 px-2 py-1">×</button></div><div className="space-y-5"><label className="block text-sm font-semibold">任務名稱<input defaultValue={selectedTask.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== selectedTask.title) updateTask(selectedTask.id, { title }); }} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">詳細敘述<textarea defaultValue={selectedTask.description ?? ''} onBlur={(event) => updateTask(selectedTask.id, { description: event.target.value.trim() || undefined })} rows={5} placeholder="記錄拍攝需求、交付規格或工作備註…" className="mt-2 w-full resize-y rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">負責人<input defaultValue={selectedTask.assignee ?? ''} onBlur={(event) => updateTask(selectedTask.id, { assignee: event.target.value.trim() || undefined })} placeholder="例如：導演、剪輯師" className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="block text-sm font-semibold">截止日期<input type="date" defaultValue={selectedTask.dueDate ?? ''} onChange={(event) => updateTask(selectedTask.id, { dueDate: event.target.value || undefined })} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal" /></label><label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={waiting.has(selectedTask.id)} onChange={(event) => setTaskWaiting(selectedTask.id, event.target.checked)} className="size-4 accent-work-primary" />
      等客戶回覆
    </label><label className="block text-sm font-semibold">單支計價<AmountInput min="0" defaultValue={selectedTask.unitPrice ?? project.defaultUnitPrice} onBlur={(event) => updateTask(selectedTask.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal text-work-positive" /><span className="mt-1 block text-xs font-normal text-work-muted">留用專案預設價格，或在這支影片個別調整。</span></label>{selectedTask.deliveredAt && <p className="rounded-lg bg-work-paper px-3 py-2 text-xs text-work-muted">交付日：{selectedTask.deliveredAt.slice(0, 10)}</p>}<label className="block text-sm font-semibold">任務狀態<select value={selectedTask.status} onChange={(event) => updateTask(selectedTask.id, { status: event.target.value })} className="mt-2 w-full rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><button onClick={() => confirmDeleteTask(selectedTask.title, selectedTask.id)} className="workspace-button workspace-button--danger px-3 py-2 text-sm">刪除任務</button></div></aside>}
  </div></main>;
}
