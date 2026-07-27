'use client';

import { useEffect, useRef, useState } from 'react';
import { Toast, useToast } from '@/app/ui/toast';
import { projectApi } from '@/lib/client/project-api';
import { cleanProjectData, createProjectData } from '@/lib/project-data';
import { Client, ProjectListItem, PROJECT_TYPES, ProjectType } from '@/types/project';

const isProjectId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function projectListItem(project: ReturnType<typeof createProjectData>, updatedAt = new Date().toISOString()): ProjectListItem {
  const financeTasks = project.tasks.filter((task) => task.moduleId === 'Finance');
  const outstandingPayable = financeTasks.filter((task) => task.transactionType !== 'income' && !task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const outstandingReceivable = financeTasks.filter((task) => task.transactionType === 'income' && !task.isPaid).reduce((sum, task) => sum + task.amount, 0) + project.monthlySettlements.filter((settlement) => settlement.status !== 'paid').reduce((sum, settlement) => sum + settlement.deliveredCount * settlement.unitPrice, 0);
  return { id: project.id, name: project.name, clientId: null, clientName: null, updated_at: updatedAt, taskCount: project.tasks.length, outstandingAmount: outstandingPayable, outstandingReceivable, outstandingPayable };
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ClientDashboard({ userEmail, onOpenProject, onSignOut }: { userEmail?: string; onOpenProject: (id: string) => void; onSignOut: () => void }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientName, setNewClientName] = useState('');
  const [newClientContact, setNewClientContact] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectType, setSelectedProjectType] = useState<ProjectType>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState<ProjectListItem | null>(null);
  const deletionTimer = useRef<number | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      const projectMap = new Map<string, ProjectListItem>();
      for (let index = 0; index < localStorage.length; index += 1) {
        const id = localStorage.key(index);
        if (!id || !isProjectId(id)) continue;
        try {
          const raw = localStorage.getItem(id);
          const project = raw ? cleanProjectData(JSON.parse(raw), id) : null;
          if (project) projectMap.set(id, projectListItem(project));
        } catch { localStorage.removeItem(id); }
      }
      try {
        const [cloudProjects, cloudClients] = await Promise.all([projectApi.list(), projectApi.listClients()]);
        cloudProjects.forEach((project) => projectMap.set(project.id, project));
        if (!cancelled) setClients(cloudClients);
      } catch { /* Offline mode keeps locally cached projects. */ }
      if (!cancelled) { setProjects([...projectMap.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))); setLoading(false); }
    }
    void loadDashboard();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (deletionTimer.current) window.clearTimeout(deletionTimer.current); }, []);

  const createClient = async () => {
    const name = newClientName.trim();
    if (!name) return;
    try {
      const client = await projectApi.createClient({ name, contactName: newClientContact.trim() || undefined });
      setClients((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')));
      setSelectedClientId(client.id);
      setNewClientName(''); setNewClientContact('');
      showToast(`已新增客戶「${client.name}」`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '客戶建立失敗', 'error'); }
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const project = createProjectData(id, name, selectedProjectType);
    localStorage.setItem(id, JSON.stringify(project));
    try {
      await projectApi.save(project);
      if (selectedClientId) await projectApi.assignClient(id, selectedClientId);
    } catch { /* The local project remains available until a future sync. */ }
    setNewProjectName('');
    onOpenProject(id);
  };

  const updateProjectClient = async (project: ProjectListItem, clientId: string) => {
    const nextClient = clients.find((client) => client.id === clientId) ?? null;
    setProjects((current) => current.map((item) => item.id === project.id ? { ...item, clientId: nextClient?.id ?? null, clientName: nextClient?.name ?? null } : item));
    try { await projectApi.assignClient(project.id, nextClient?.id ?? null); }
    catch (error) { showToast(error instanceof Error ? error.message : '專案歸屬更新失敗', 'error'); setProjects((current) => current.map((item) => item.id === project.id ? project : item)); }
  };

  const editClient = async (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    const name = window.prompt('客戶／公司名稱', client.name)?.trim();
    if (!name) return;
    const contactName = window.prompt('主要聯絡人（可留空）', client.contactName ?? '')?.trim();
    if (contactName === undefined) return;
    try {
      const updated = await projectApi.updateClient(clientId, { ...client, name, contactName: contactName || undefined });
      setClients((current) => current.map((item) => item.id === clientId ? updated : item).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')));
      setProjects((current) => current.map((project) => project.clientId === clientId ? { ...project, clientName: updated.name } : project));
      showToast('客戶資料已更新', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '客戶更新失敗', 'error'); }
  };

  const mergeClient = async (sourceId: string) => {
    const source = clients.find((client) => client.id === sourceId);
    const targets = clients.filter((client) => client.id !== sourceId);
    if (!source || targets.length === 0) {
      showToast('沒有可合併的其他客戶', 'info');
      return;
    }
    const targetName = window.prompt(`將「${source.name}」合併到哪位客戶？\n${targets.map((client) => `• ${client.name}`).join('\n')}`)?.trim();
    if (!targetName) return;
    const target = targets.find((client) => client.name.toLocaleLowerCase('zh-TW') === targetName.toLocaleLowerCase('zh-TW'));
    if (!target) {
      showToast('找不到指定的目標客戶，請輸入完整名稱', 'error');
      return;
    }
    if (!window.confirm(`確定將「${source.name}」的專案全部移到「${target.name}」，並刪除原客戶嗎？`)) return;
    try {
      await projectApi.mergeClients(source.id, target.id);
      setClients((current) => current.filter((client) => client.id !== source.id));
      setProjects((current) => current.map((project) => project.clientId === source.id ? { ...project, clientId: target.id, clientName: target.name } : project));
      setSelectedClientId((current) => current === source.id ? target.id : current);
      showToast(`已合併至「${target.name}」`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '客戶合併失敗', 'error'); }
  };

  const deleteClient = async (clientId: string, clientName: string, projectCount: number) => {
    const projectNotice = projectCount > 0 ? `\n名下 ${projectCount} 個專案會移至「未分類客戶」，不會被刪除。` : '';
    if (!window.confirm(`確定要刪除客戶「${clientName}」嗎？${projectNotice}`)) return;
    try {
      await projectApi.removeClient(clientId);
      setClients((current) => current.filter((client) => client.id !== clientId));
      setProjects((current) => current.map((project) => project.clientId === clientId ? { ...project, clientId: null, clientName: null } : project));
      setSelectedClientId((current) => current === clientId ? '' : current);
      showToast(`已刪除客戶「${clientName}」`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '客戶刪除失敗', 'error');
    }
  };

  const permanentlyDeleteProject = (project: ProjectListItem) => { localStorage.removeItem(project.id); void projectApi.remove(project.id); };
  const deleteProject = (project: ProjectListItem) => {
    if (!window.confirm(`確定要刪除「${project.name}」嗎？你可在 6 秒內復原。`)) return;
    if (pendingDeletion) { if (deletionTimer.current) window.clearTimeout(deletionTimer.current); permanentlyDeleteProject(pendingDeletion); }
    setProjects((current) => current.filter((item) => item.id !== project.id)); setPendingDeletion(project);
    deletionTimer.current = window.setTimeout(() => { permanentlyDeleteProject(project); setPendingDeletion((current) => current?.id === project.id ? null : current); deletionTimer.current = null; }, 6000);
  };
  const restoreProject = () => { if (!pendingDeletion) return; if (deletionTimer.current) window.clearTimeout(deletionTimer.current); deletionTimer.current = null; setProjects((current) => [...current, pendingDeletion].sort((a, b) => b.updated_at.localeCompare(a.updated_at))); setPendingDeletion(null); };
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('zh-TW');
  const matches = (value?: string | null) => !normalizedQuery || value?.toLocaleLowerCase('zh-TW').includes(normalizedQuery);
  const clientGroups = [...clients.map((client) => ({ id: client.id, name: client.name, contact: client.contactName, projects: projects.filter((project) => project.clientId === client.id).filter((project) => matches(project.name)) })).filter((group) => matches(group.name) || matches(group.contact) || group.projects.length > 0), { id: 'unassigned', name: '未分類客戶', contact: undefined, projects: projects.filter((project) => !project.clientId && matches(project.name)) }];
  const totalReceivable = projects.reduce((sum, project) => sum + project.outstandingReceivable, 0);
  const totalPayable = projects.reduce((sum, project) => sum + project.outstandingPayable, 0);

  return <main className="client-dashboard min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-6 md:p-12"><div className="mx-auto max-w-6xl">
    <header className="mb-7 flex flex-col gap-4 border-b border-slate-800 pb-6 sm:mb-10 sm:flex-row sm:items-start sm:justify-between sm:pb-7"><div><h1 className="text-3xl font-black text-indigo-400 sm:text-4xl">🎬 影視製片控制台</h1><p className="mt-2 text-sm text-slate-400">以客戶為主分類，管理專案、進度與成本</p></div><div className="text-left text-xs text-slate-400 sm:text-right"><p className="break-all">{userEmail}</p><button onClick={onSignOut} className="mt-2 text-rose-400 hover:text-rose-300">登出</button></div></header>
    <section className="mb-6 grid gap-4 lg:grid-cols-2"><form onSubmit={(event) => { event.preventDefault(); void createClient(); }} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="font-bold">新增客戶</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="客戶／公司名稱" className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" /><input value={newClientContact} onChange={(event) => setNewClientContact(event.target.value)} placeholder="主要聯絡人（選填）" className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" /><button className="rounded-xl bg-slate-700 px-5 py-3 text-sm font-bold hover:bg-slate-600">新增</button></div></form>
      <form onSubmit={(event) => { event.preventDefault(); void createProject(); }} className="rounded-2xl border border-indigo-900/70 bg-slate-900/60 p-5"><h2 className="font-bold">建立客戶專案</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row"><select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"><option value="">未分類客戶</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="輸入新的影視專案名稱" className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" /><button className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold hover:bg-indigo-500">建立</button></div></form></section>
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><label className="block text-sm font-bold">新專案工作模板<select value={selectedProjectType} onChange={(event) => setSelectedProjectType(event.target.value as ProjectType)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">{PROJECT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}｜{type.description}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">模板會預先設定腳本、拍攝、後製的任務狀態；建立後仍可依案件調整。</p></section>
    <section aria-label="跨專案財務摘要" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"><DashboardMetric label="待收款" value={totalReceivable} tone="text-amber-300" /><DashboardMetric label="待支付" value={totalPayable} tone="text-rose-300" /><DashboardMetric label="專案數" value={projects.length} /><DashboardMetric label="客戶數" value={clients.length} /></section>
    <label className="mb-6 block text-sm font-bold">搜尋客戶或專案<input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="輸入客戶、聯絡人或專案名稱" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base font-normal" /></label>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">客戶與專案</h2><span className="text-xs text-slate-500">{clients.length} 位客戶 · {projects.length} 個專案</span></div>
    {loading ? <p className="py-12 text-center text-slate-500">資料載入中…</p> : <div className="space-y-5">{clientGroups.filter((group) => group.projects.length || (group.id !== 'unassigned' && matches(group.name))).map((group) => <section key={group.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"><header className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="break-words font-bold text-indigo-300">{group.name}</h3>{group.contact && <p className="mt-1 text-xs text-slate-500">聯絡人：{group.contact}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-slate-500">{group.projects.length} 個專案</span>{group.id !== 'unassigned' && <><button onClick={() => void editClient(group.id)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">編輯</button><button onClick={() => void mergeClient(group.id)} className="rounded-lg border border-indigo-900/70 px-2.5 py-1.5 text-xs text-indigo-300 hover:bg-indigo-950/50">合併</button><button onClick={() => void deleteClient(group.id, group.name, group.projects.length)} aria-label={`刪除客戶 ${group.name}`} className="rounded-lg border border-rose-900/70 px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-950/50">刪除</button></>}</div></header>{group.projects.length === 0 ? <p className="py-5 text-center text-xs text-slate-600">尚無專案</p> : <div className="grid gap-3 md:grid-cols-2">{group.projects.map((project) => <article key={project.id} onClick={() => onOpenProject(project.id)} className="flex cursor-pointer items-start justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-indigo-500"><div className="min-w-0"><h4 className="break-words font-bold">{project.name}</h4><p className="mt-1 text-xs text-slate-500">最近更新：{formatUpdatedAt(project.updated_at)}</p><p className="mt-3 text-xs text-slate-400">待收 NT$ {project.outstandingReceivable.toLocaleString()} · 待付 NT$ {project.outstandingPayable.toLocaleString()}</p><select value={project.clientId ?? ''} onClick={(event) => event.stopPropagation()} onChange={(event) => void updateProjectClient(project, event.target.value)} className="mt-3 max-w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"><option value="">未分類客戶</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div><button onClick={(event) => { event.stopPropagation(); deleteProject(project); }} aria-label={`刪除 ${project.name}`} className="rounded-lg p-2 text-slate-500 hover:text-rose-400">🗑️</button></article>)}</div>}</section>)}</div>}
  </div>{pendingDeletion && <div className="fixed bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm shadow-xl sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:px-5"><span className="min-w-0 truncate">已刪除「{pendingDeletion.name}」</span><button onClick={restoreProject} className="shrink-0 font-bold text-indigo-400 hover:text-indigo-300">復原</button></div>}<Toast message={toast} onDismiss={dismissToast} /></main>;
}

function DashboardMetric({ label, value, tone = 'text-slate-100' }: { label: string; value: number; tone?: string }) {
  const formatted = label.includes('款') || label.includes('支付') ? `NT$ ${value.toLocaleString()}` : value.toLocaleString();
  return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-lg font-black ${tone}`}>{formatted}</p></div>;
}
