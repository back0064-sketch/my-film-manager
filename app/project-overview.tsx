'use client';

import { ModuleId, WORKSPACE_MODULES } from '@/types/project';

export function ProjectWorkspaceNavigation({ activeModule, onChange }: { activeModule: ModuleId; onChange: (moduleId: ModuleId) => void }) {
  return <nav aria-label="專案功能" className="project-workspace-nav sticky top-0 z-10 mb-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-950/95 p-2 shadow-lg backdrop-blur lg:static lg:max-w-md">{WORKSPACE_MODULES.map((module) => <button key={module.id} onClick={() => onChange(module.id)} className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${activeModule === module.id ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{module.name}</button>)}</nav>;
}

export function ProjectSummary({ completionRate, completedCount, totalCount, modules }: { completionRate: number; completedCount: number; totalCount: number; modules: { id: ModuleId; name: string; total: number; completed: number }[] }) {
  return <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">專案摘要</h2><p className="mt-1 text-xs text-slate-400">製作任務完成度與各階段進度</p></div><div className="text-left sm:text-right"><p className="text-2xl font-black text-indigo-400">{completionRate}%</p><p className="text-xs text-slate-400">{completedCount} / {totalCount} 項製作任務已完成</p></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${completionRate}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{modules.map((module) => <div key={module.id} className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-400">{module.name}</p><p className="mt-1 text-sm font-bold">{module.completed} / {module.total} 已完成</p></div>)}</div></section>;
}
