'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toast, useToast } from '@/app/ui/toast';
import { WorkCommandPanel } from '@/app/work-command-panel';
import { MfaPanel } from '@/app/mfa-panel';
import { projectApi } from '@/lib/client/project-api';
import { dashboardCacheKey, readDashboardCache, writeDashboardCache } from '@/lib/client/dashboard-cache';
import { projectCacheKey, projectCachePrefix } from '@/lib/client/project-cache';
import { cleanProjectData, createProjectData } from '@/lib/project-data';
import { projectFinancialSummary } from '@/lib/projects/project-summary';
import { buildProjectCommandSummary } from '@/lib/projects/work-command';
import { Client, OpenProject, ProjectListItem, PROJECT_TYPES, ProjectType } from '@/types/project';

const dashboardSections = [
  { id: 'work', label: '工作台' },
  { id: 'projects', label: '專案' },
  { id: 'finance', label: '財務' },
  { id: 'settings', label: '設定' },
] as const;

export type DashboardSection = (typeof dashboardSections)[number]['id'];

const dashboardHeadings: Record<DashboardSection, string> = {
  work: '工作台',
  projects: '客戶與專案',
  finance: '財務追款',
  settings: '設定',
};

const inputClass = 'w-full min-w-0 rounded-lg border border-work-control bg-work-input px-3 py-2.5 text-base text-work-ink placeholder:text-work-muted';
const secondaryButton = 'workspace-button px-3 py-2.5 text-sm font-semibold';
const primaryButton = 'workspace-button workspace-button--primary px-3 py-2.5 text-sm font-semibold disabled:opacity-50';

const isProjectId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function projectListItem(project: ReturnType<typeof createProjectData>, updatedAt = new Date().toISOString()): ProjectListItem {
  const { outstandingPayable, outstandingReceivable } = projectFinancialSummary(project);
  return {
    id: project.id,
    name: project.name,
    archivedAt: project.archivedAt,
    plannedCloseDate: project.plannedCloseDate,
    clientId: null,
    clientName: null,
    updated_at: updatedAt,
    taskCount: project.tasks.length,
    outstandingAmount: outstandingPayable,
    outstandingReceivable,
    outstandingPayable,
    ...buildProjectCommandSummary(project),
  };
}

const updatedAtFormat = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

export function ClientDashboard({ userId, userEmail, section, onSectionChange, onOpenProject, onSignOut }: {
  userId: string;
  userEmail?: string;
  section: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  onOpenProject: OpenProject;
  onSignOut: () => void;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'current' | 'unavailable'>('checking');
  const [newClientName, setNewClientName] = useState('');
  const [newClientContact, setNewClientContact] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectType, setSelectedProjectType] = useState<ProjectType>('general');
  const [createForm, setCreateForm] = useState<'client' | 'project' | null>(null);
  const [settingsVisited, setSettingsVisited] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archivePending, setArchivePending] = useState<string | null>(null);
  const [showFinancialAmounts, setShowFinancialAmounts] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<ProjectListItem | null>(null);
  const deletionTimer = useRef<number | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      const cacheKey = dashboardCacheKey(userId);
      const cachedProjects = readDashboardCache(localStorage, cacheKey);
      const projectMap = new Map<string, ProjectListItem>(cachedProjects.map((project) => [project.id, project]));
      if (!cancelled && cachedProjects.length > 0) {
        setProjects(cachedProjects);
        setLoading(false);
      }
      for (let index = 0; index < localStorage.length; index += 1) {
        const id = localStorage.key(index);
        if (!id || !id.startsWith(projectCachePrefix(userId))) continue;
        const projectId = id.slice(projectCachePrefix(userId).length);
        if (!isProjectId(projectId)) continue;
        try {
          const raw = localStorage.getItem(id);
          const project = raw ? cleanProjectData(JSON.parse(raw), projectId) : null;
          if (project && !projectMap.has(projectId)) projectMap.set(projectId, projectListItem(project));
        } catch { localStorage.removeItem(id); }
      }
      const localProjects = [...projectMap.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (!cancelled && localProjects.length > 0) {
        setProjects(localProjects);
        setLoading(false);
      }
      try {
        const [cloudProjects, cloudClients] = await Promise.all([projectApi.list(), projectApi.listClients()]);
        cloudProjects.forEach((project) => projectMap.set(project.id, project));
        if (!cancelled) {
          setClients(cloudClients);
          const nextProjects = [...projectMap.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          setProjects(nextProjects);
          writeDashboardCache(localStorage, nextProjects, cacheKey);
          setCloudStatus('current');
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          const nextProjects = [...projectMap.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          setProjects(nextProjects);
          setCloudStatus('unavailable');
          setLoading(false);
        }
      }
    }
    void loadDashboard();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!loading && cloudStatus === 'current') writeDashboardCache(localStorage, projects, dashboardCacheKey(userId));
  }, [cloudStatus, loading, projects, userId]);

  useEffect(() => () => { if (deletionTimer.current) window.clearTimeout(deletionTimer.current); }, []);

  const createClient = async () => {
    const name = newClientName.trim();
    if (!name) return;
    try {
      const client = await projectApi.createClient({ name, contactName: newClientContact.trim() || undefined });
      setClients((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')));
      setSelectedClientId(client.id);
      setNewClientName(''); setNewClientContact('');
      setCreateForm(null);
      setSearchQuery('');
      setShowArchived(false);
      showToast(`已新增客戶「${client.name}」`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '客戶建立失敗', 'error'); }
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const project = createProjectData(id, name, selectedProjectType);
    localStorage.setItem(projectCacheKey(userId, id), JSON.stringify(project));
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

  const permanentlyDeleteProject = (project: ProjectListItem) => { localStorage.removeItem(projectCacheKey(userId, project.id)); void projectApi.remove(project.id); };
  const deleteProject = (project: ProjectListItem) => {
    if (!window.confirm(`確定要刪除「${project.name}」嗎？你可在 6 秒內復原。`)) return;
    if (pendingDeletion) { if (deletionTimer.current) window.clearTimeout(deletionTimer.current); permanentlyDeleteProject(pendingDeletion); }
    setProjects((current) => current.filter((item) => item.id !== project.id)); setPendingDeletion(project);
    deletionTimer.current = window.setTimeout(() => { permanentlyDeleteProject(project); setPendingDeletion((current) => current?.id === project.id ? null : current); deletionTimer.current = null; }, 6000);
  };
  const restoreProject = () => { if (!pendingDeletion) return; if (deletionTimer.current) window.clearTimeout(deletionTimer.current); deletionTimer.current = null; setProjects((current) => [...current, pendingDeletion].sort((a, b) => b.updated_at.localeCompare(a.updated_at))); setPendingDeletion(null); };

  const changeArchive = async (project: ProjectListItem) => {
    const archiving = !project.archivedAt;
    if (archiving && !window.confirm(`將「${project.name}」移到已歸檔？未收款項仍會顯示在追款清單。`)) return;
    setArchivePending(project.id);
    try {
      const result = await projectApi.setArchived(project.id, archiving);
      // Refresh the summary so reopening restores work items without loading the project board.
      const refreshed = await projectApi.list().catch(() => null);
      setProjects((current) => {
        const updated = refreshed?.find((item) => item.id === project.id);
        return current.map((item) => item.id !== project.id ? item : updated ?? { ...item, updated_at: result.updated_at, archivedAt: result.archivedAt ?? undefined });
      });
      showToast(archiving ? '專案已歸檔' : '專案已恢復為進行中', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '無法更新專案歸檔狀態', 'error');
    } finally {
      setArchivePending(null);
    }
  };
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('zh-TW');
  const matches = useCallback((value?: string | null) => !normalizedQuery || value?.toLocaleLowerCase('zh-TW').includes(normalizedQuery), [normalizedQuery]);
  const visibleProjects = useMemo(() => projects.filter((project) => normalizedQuery || Boolean(project.archivedAt) === showArchived), [projects, normalizedQuery, showArchived]);
  const clientGroups = useMemo(() => {
    if (section !== 'projects') return [];
    const groups = clients.map((client) => ({
      id: client.id,
      name: client.name,
      contact: client.contactName,
      projects: visibleProjects.filter((project) => project.clientId === client.id && (
        matches(client.name) || matches(client.contactName) || matches(project.name)
      )),
    }));
    return [...groups.filter((group) => group.projects.length || (!showArchived && (matches(group.name) || matches(group.contact)))), {
      id: 'unassigned',
      name: '未分類客戶',
      contact: undefined,
      projects: visibleProjects.filter((project) => !project.clientId && matches(project.name)),
    }].filter((group) => group.id !== 'unassigned' || group.projects.length);
  }, [clients, matches, section, showArchived, visibleProjects]);
  const totalReceivable = useMemo(() => projects.reduce((sum, project) => sum + project.outstandingReceivable, 0), [projects]);
  const totalPayable = useMemo(() => projects.reduce((sum, project) => sum + project.outstandingPayable, 0), [projects]);

  const selectSection = (next: DashboardSection) => {
    if (next === 'settings') setSettingsVisited(true);
    if (next === section) return;
    setCreateForm(null);
    onSectionChange(next);
    window.scrollTo(0, 0);
  };
  const startProject = () => {
    selectSection('projects');
    setCreateForm((current) => section === 'projects' && current === 'project' ? null : 'project');
  };

  return (
    <main className="client-dashboard min-h-screen bg-work-paper">
      <div className="mx-auto grid min-h-screen max-w-[112rem] grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="workspace-sidebar sticky top-0 z-10 self-start border-b px-4 pb-2 backdrop-blur lg:flex lg:min-h-screen lg:flex-col lg:border-r lg:border-b-0 lg:p-5">
          <div className="flex min-h-12 items-center gap-2.5 py-2 lg:mb-8 lg:px-2">
            <span aria-hidden="true" className="workspace-mark grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold">影</span>
            <span className="text-sm font-semibold tracking-wide">影視製片控制台</span>
          </div>
          <nav aria-label="工作區導覽" className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-2">
            {dashboardSections.map(({ id, label }) => (
              <button key={id} type="button" aria-current={section === id ? 'page' : undefined}
                onClick={() => selectSection(id)}
                className="workspace-nav flex min-h-11 items-center justify-center gap-2 border px-1 text-sm font-semibold lg:justify-start lg:px-3">
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8 2xl:px-10">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-work-line pb-4 sm:mb-6 lg:pb-5">
            <h1 className="workspace-heading text-2xl font-semibold tracking-tight sm:text-3xl">{dashboardHeadings[section]}</h1>
            {(section === 'work' || section === 'projects') && (
              <button type="button" onClick={startProject} className={primaryButton}
                aria-expanded={section === 'projects' ? createForm === 'project' : undefined}>
                <span className="inline-flex items-center gap-2">新增專案 <span className="workspace-arrow" aria-hidden="true">→</span></span>
              </button>
            )}
          </header>

          {!loading && cloudStatus !== 'current' && <p role="status" className="workspace-warning mb-4 rounded-lg p-3 text-sm">
            {cloudStatus === 'checking' ? '正在核對大廳的雲端版本。' : '大廳目前無法取得雲端資料，清單與金額可能未更新。'}
          </p>}

          {(section === 'work' || section === 'finance') && (
            loading ? <p role="status" className="py-10 text-center text-work-muted">資料載入中…</p> :
              <WorkCommandPanel projects={projects} totalReceivable={totalReceivable} totalPayable={totalPayable}
                showAmounts={showFinancialAmounts} onToggleAmounts={() => setShowFinancialAmounts((current) => !current)}
                onOpenProject={onOpenProject} financeOnly={section === 'finance'} />
          )}

          {(section === 'settings' || settingsVisited) && (
            <div hidden={section !== 'settings'} className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <MfaPanel />
              <section aria-label="帳號與備份" className="rounded-2xl border border-work-line bg-work-surface p-4 sm:p-6">
                <h2 className="text-lg font-semibold">帳號與備份</h2>
                {userEmail && <p className="mt-2 break-all text-sm text-work-muted">{userEmail}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <a href="/api/backups/download" download className={secondaryButton}>下載營運備份</a>
                  <button type="button" onClick={onSignOut} className="workspace-button workspace-button--danger px-3 py-2.5 text-sm font-semibold">登出</button>
                </div>
              </section>
            </div>
          )}

          {section === 'projects' && <section aria-label="專案清單" className="min-w-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <label className="block w-full max-w-xl text-sm font-medium text-work-muted">
                搜尋客戶或專案
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="輸入客戶、聯絡人或專案名稱" className={`mt-2 ${inputClass}`} />
              </label>
              <button type="button" aria-expanded={createForm === 'client'}
                onClick={() => setCreateForm((current) => current === 'client' ? null : 'client')}
                className={secondaryButton}>＋ 新增客戶</button>
            </div>

            {createForm === 'client' && (
              <form onSubmit={(event) => { event.preventDefault(); void createClient(); }}
                className="mb-5 rounded-2xl border border-work-line bg-work-surface p-4 sm:p-5">
                <h2 className="font-semibold">新增客戶</h2>
                <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="grid gap-2 text-sm">客戶／公司名稱<input className={inputClass} required value={newClientName} onChange={(event) => setNewClientName(event.target.value)} /></label>
                  <label className="grid gap-2 text-sm">主要聯絡人（選填）<input className={inputClass} value={newClientContact} onChange={(event) => setNewClientContact(event.target.value)} /></label>
                  <button type="submit" className={primaryButton}>新增客戶</button>
                </div>
              </form>
            )}
            {createForm === 'project' && (
              <form onSubmit={(event) => { event.preventDefault(); void createProject(); }}
                className="mb-5 rounded-2xl border border-work-rule bg-work-surface p-4 sm:p-5">
                <h2 className="font-semibold">建立客戶專案</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label className="grid gap-2 text-sm">專案名稱<input className={inputClass} required value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /></label>
                  <label className="grid gap-2 text-sm">所屬客戶<select className={inputClass} value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                    <option value="">未分類客戶</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select></label>
                  <label className="grid gap-2 text-sm">新專案工作模板<select className={inputClass} value={selectedProjectType} onChange={(event) => setSelectedProjectType(event.target.value as ProjectType)}>
                    {PROJECT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}｜{type.description}</option>)}
                  </select></label>
                  <button type="submit" className={`${primaryButton} self-end`}>建立專案</button>
                </div>
              </form>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {!normalizedQuery && <div aria-label="專案列表篩選" role="group" className="flex gap-2">
                <button type="button" aria-pressed={!showArchived} onClick={() => setShowArchived(false)} className="workspace-filter px-3 py-2 text-sm">進行中</button>
                <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived(true)} className="workspace-filter px-3 py-2 text-sm">已歸檔</button>
              </div>}
              <p className="text-xs text-work-muted">{clients.length} 位客戶 · {projects.length} 個專案</p>
            </div>
            {loading ? <p role="status" className="py-12 text-center text-work-muted">資料載入中…</p> :
              clientGroups.length === 0 ? <p className="rounded-2xl border border-dashed border-work-line px-4 py-10 text-center text-sm text-work-muted">
                {normalizedQuery ? '找不到符合搜尋的客戶或專案。' : showArchived ? '目前沒有已歸檔的專案。' : '目前沒有進行中的專案。'}
              </p> : <div className="space-y-5">
                {clientGroups.map((group) => (
                  <section key={group.id} className="project-client-group py-4 sm:py-5">
                    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-work-line pb-3">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold text-work-ink">{group.name}</h2>
                        {group.contact && <p className="mt-1 break-words text-xs text-work-muted">聯絡人 {group.contact}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-work-muted">{group.projects.length} 個專案</span>
                        {group.id !== 'unassigned' && <>
                          <button type="button" onClick={() => void editClient(group.id)} className="workspace-button px-2.5 py-1.5 text-xs">編輯</button>
                          <button type="button" onClick={() => void mergeClient(group.id)} className="workspace-button px-2.5 py-1.5 text-xs">合併</button>
                          <button type="button" onClick={() => void deleteClient(group.id, group.name, projects.filter((project) => project.clientId === group.id).length)}
                            aria-label={`刪除客戶 ${group.name}`} className="workspace-button workspace-button--quiet workspace-button--danger px-2.5 py-1.5 text-xs">
                            刪除
                          </button>
                        </>}
                      </div>
                    </header>
                    {group.projects.length === 0 ? <p className="py-5 text-center text-xs text-work-muted">尚無專案</p> : (
                      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {group.projects.map((project) => (
                          <article key={project.id} onClick={() => onOpenProject(project.id)} className="project-card flex min-w-0 cursor-pointer items-start justify-between gap-2 rounded-xl border border-work-line bg-work-input p-4 hover:border-work-control">
                            <div className="min-w-0">
                              <h3 className="break-words font-semibold">
                                <button type="button" onClick={(event) => { event.stopPropagation(); onOpenProject(project.id); }} className="workspace-button text-left hover:text-work-link px-2 py-1">{project.name}</button>
                              </h3>
                              <p className="mt-1 text-xs text-work-muted">
                                {project.archivedAt && <span className="text-work-link">已歸檔 · </span>}
                                最近更新 {Number.isFinite(Date.parse(project.updated_at)) ? updatedAtFormat.format(new Date(project.updated_at)) : '—'}
                              </p>
                              {showFinancialAmounts && <p className="mt-2 text-xs text-work-muted tabular-nums">
                                待收 NT$ {project.outstandingReceivable.toLocaleString()} · 待付 NT$ {project.outstandingPayable.toLocaleString()}
                              </p>}
                              <select value={project.clientId ?? ''} onClick={(event) => event.stopPropagation()}
                                onChange={(event) => void updateProjectClient(project, event.target.value)} aria-label={`變更 ${project.name} 的客戶`}
                                className="mt-3 max-w-full rounded-lg border border-work-control bg-work-input px-2 py-1.5 text-xs text-work-muted">
                                <option value="">未分類客戶</option>
                                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                              </select>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <button type="button" disabled={archivePending !== null} aria-label={`${project.archivedAt ? '恢復' : '歸檔'} ${project.name}`}
                                onClick={(event) => { event.stopPropagation(); void changeArchive(project); }} className="workspace-button px-2 py-1.5 text-xs disabled:opacity-50">
                                {project.archivedAt ? '恢復' : '歸檔'}
                              </button>
                              <button type="button" onClick={(event) => { event.stopPropagation(); deleteProject(project); }}
                                aria-label={`刪除 ${project.name}`} className="workspace-button workspace-button--quiet workspace-button--danger px-2 py-1.5 text-xs">
                                刪除
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>}
          </section>}
        </div>
      </div>
      {pendingDeletion && <div className="fixed bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-work-control bg-work-surface px-4 py-3 text-sm shadow-xl sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:px-5"><span className="min-w-0 truncate">已刪除「{pendingDeletion.name}」</span><button onClick={restoreProject} className="workspace-button shrink-0 font-bold px-2 py-1">復原</button></div>}<Toast message={toast} onDismiss={dismissToast} /></main>
  );
}
