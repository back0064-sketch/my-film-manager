'use client';

import { useEffect, useState } from 'react';
import { useProjectData } from '@/hooks/useProjectData';
import { projectApi } from '@/lib/api/project-api';
import { cleanProjectData, createProjectData } from '@/lib/project-data';
import { MODULES, ModuleId, ProjectListItem } from '@/types/project';

const isProjectId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
type SessionUser = { id: string; email?: string };

export default function Home() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

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
          if (project) projectMap.set(id, { id, name: project.name, updated_at: new Date().toISOString() });
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

  const deleteProject = async (project: ProjectListItem) => {
    if (!confirm(`確定要永久刪除「${project.name}」嗎？`)) return;
    localStorage.removeItem(project.id);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    try { await projectApi.remove(project.id); } catch { /* Offline mode keeps local data. */ }
  };

  if (sessionLoading) return <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">登入狀態確認中…</main>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  if (activeProjectId) return <ProjectBoard projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />;

  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-12">
    <div className="mx-auto max-w-5xl">
      <header className="mb-10 flex items-start justify-between border-b border-slate-800 pb-7">
        <div><h1 className="text-4xl font-black text-indigo-400">🎬 影視製片控制台</h1><p className="mt-2 text-sm text-slate-400">專案、製作進度與款項管理</p></div>
        <div className="text-right text-xs text-slate-400"><p>{user.email}</p><button onClick={() => void projectApi.signOut().finally(() => { setProjects([]); setUser(null); })} className="mt-2 text-rose-400 hover:text-rose-300">登出</button></div>
      </header>
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row">
        <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void createProject()} placeholder="輸入新的影視專案名稱" className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
        <button onClick={() => void createProject()} className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold hover:bg-indigo-500">建立新專案</button>
      </div>
      <h2 className="mb-4 text-lg font-bold">專案看板 ({projects.length})</h2>
      {loading ? <p className="py-12 text-center text-slate-500">資料載入中…</p> : projects.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">尚無專案，請從上方建立。</p> :
        <div className="grid gap-4 md:grid-cols-2">{projects.map((project) => <article key={project.id} onClick={() => setActiveProjectId(project.id)} className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-indigo-500">
          <h3 className="text-lg font-bold">{project.name}</h3>
          <button onClick={(event) => { event.stopPropagation(); void deleteProject(project); }} aria-label={`刪除 ${project.name}`} className="rounded-lg p-2 text-slate-500 hover:text-rose-400">🗑️</button>
        </article>)}</div>}
    </div>
  </main>;
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
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl"><h1 className="text-3xl font-black text-indigo-400">🎬 影視製片控制台</h1><p className="mt-2 text-sm text-slate-400">{isSignIn ? '登入以存取你的專案。' : '建立帳號以開始管理專案。'}</p><div className="mt-6 space-y-4"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submit()} placeholder="密碼（至少 8 字元）" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" /><button disabled={pending} onClick={() => void submit()} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '處理中…' : isSignIn ? '登入' : '註冊'}</button></div>{message && <p className="mt-4 text-sm text-amber-300">{message}</p>}<button onClick={() => { setMode(isSignIn ? 'signUp' : 'signIn'); setMessage(''); }} className="mt-6 text-sm text-indigo-400 hover:text-indigo-300">{isSignIn ? '還沒有帳號？立即註冊' : '已有帳號？回到登入'}</button></section></main>;
}

function ProjectBoard({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { project, loading, addTask, deleteTask, updateTask } = useProjectData(projectId);
  const [activeModule, setActiveModule] = useState<ModuleId>('Scripting');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  if (loading || !project) return <main className="min-h-screen bg-slate-950 p-12 text-center text-slate-400">專案載入中…</main>;

  const financeTasks = project.tasks.filter((task) => task.moduleId === 'Finance');
  const total = financeTasks.reduce((sum, task) => sum + task.amount, 0);
  const paid = financeTasks.filter((task) => task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const statuses = project.moduleConfigs.find((config) => config.moduleId === activeModule)?.customStatuses ?? [];
  const createTask = () => {
    const title = newTaskTitle.trim();
    if (!title || !statuses[0]) return;
    addTask(title, activeModule, statuses[0]);
    setNewTaskTitle('');
  };

  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-7xl">
    <header className="mb-6 flex items-center gap-4 border-b border-slate-800 pb-6"><button onClick={onBack} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">← 返回大廳</button><div><h1 className="text-2xl font-black">{project.name}</h1><p className="text-xs text-slate-500">本機優先，背景同步至雲端</p></div></header>
    <div className="mb-8 grid gap-4 md:grid-cols-3">{[['專案款項總額', total, 'text-indigo-400'], ['已入帳總額', paid, 'text-emerald-400'], ['待收款', total - paid, 'text-amber-400']].map(([label, amount, color]) => <section key={label as string} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-xs text-slate-400">{label}</p><p className={`mt-2 text-2xl font-black ${color}`}>NT$ {(amount as number).toLocaleString()}</p></section>)}</div>
    <div className="grid gap-6 lg:grid-cols-4"><nav className="h-fit rounded-xl border border-slate-800 bg-slate-900/40 p-4">{MODULES.map((module) => <button key={module.id} onClick={() => setActiveModule(module.id)} className={`mb-1 w-full rounded-lg px-4 py-3 text-left text-sm font-semibold ${activeModule === module.id ? 'bg-indigo-600' : 'text-slate-400 hover:bg-slate-800'}`}>{module.name}</button>)}</nav>
      <section className="space-y-4 lg:col-span-3"><input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createTask()} placeholder="輸入任務名稱後按 Enter 新增" className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm" />
        <div className="grid gap-4 md:grid-cols-3">{statuses.map((status) => { const tasks = project.tasks.filter((task) => task.moduleId === activeModule && task.status === status); return <section key={status} className="flex min-h-80 flex-col rounded-xl border border-slate-800 bg-slate-900/20 p-4"><header className="mb-4 flex justify-between border-b border-slate-800 pb-2 text-xs font-bold text-slate-400"><span>{status}</span><span>{tasks.length}</span></header><div className="space-y-2">{tasks.map((task) => <article key={task.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="flex gap-2"><input value={task.title} onChange={(event) => updateTask(task.id, { title: event.target.value })} className="min-w-0 flex-1 bg-transparent text-sm" /><button onClick={() => deleteTask(task.id)} className="text-rose-400">×</button></div>{activeModule === 'Finance' && <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3"><label className="text-xs">NT$ <input type="number" value={task.amount} onChange={(event) => updateTask(task.id, { amount: Number(event.target.value) })} className="w-24 rounded border border-slate-800 bg-slate-950 px-1 text-emerald-400" /></label><label className="text-xs"><input type="checkbox" checked={task.isPaid} onChange={(event) => updateTask(task.id, { isPaid: event.target.checked })} /> 已支付</label></div>}</article>)}{tasks.length === 0 && <p className="py-12 text-center text-xs text-slate-600">尚無任務</p>}</div></section>; })}</div>
      </section></div>
  </div></main>;
}
