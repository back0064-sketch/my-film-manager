'use client';

import { ModuleId, WORKSPACE_MODULES } from '@/types/project';

export function ProjectWorkspaceNavigation({ activeModule, onChange }: { activeModule: ModuleId; onChange: (moduleId: ModuleId) => void }) {
  return (
    <nav aria-label="專案功能" className="project-workspace-nav sticky top-0 z-10 mb-6 grid grid-cols-2 gap-2 border-b border-work-line bg-work-paper py-2 lg:static lg:max-w-md">
      {WORKSPACE_MODULES.map((module) => (
        <button key={module.id} type="button" aria-pressed={activeModule === module.id}
          onClick={() => onChange(module.id)} className="workspace-filter px-4 py-3 text-center text-sm font-semibold">
          {module.name}
        </button>
      ))}
    </nav>
  );
}

export function ProjectSummary({ completionRate, completedCount, totalCount, modules, plannedCloseDate, onPlannedCloseDateChange }: { completionRate: number; completedCount: number; totalCount: number; modules: { id: ModuleId; name: string; total: number; completed: number }[]; plannedCloseDate?: string; onPlannedCloseDateChange: (date: string) => void }) {
  return <section className="workspace-panel mb-6 px-4 py-5 sm:px-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold">專案摘要</h2><p className="mt-1 text-xs text-work-muted">製作任務完成度與各階段進度</p></div><div className="text-left sm:text-right"><p className="text-2xl font-black text-work-link">{completionRate}%</p><p className="text-xs text-work-muted">{completedCount} / {totalCount} 項製作任務已完成</p></div></div><label className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-work-muted">
      預計結案日
      <input type="date" value={plannedCloseDate ?? ''} onChange={(event) => onPlannedCloseDateChange(event.target.value)} className="min-w-0 rounded-lg border border-work-control bg-work-paper px-3 py-2 text-sm font-normal text-work-ink" />
    </label><div className="mt-4 h-2 overflow-hidden rounded-full bg-work-hover"><div className="h-full rounded-full bg-work-primary transition-[width] motion-reduce:transition-none" style={{ width: `${completionRate}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{modules.map((module) => <div key={module.id} className="rounded-xl bg-work-surface p-3"><p className="text-xs text-work-muted">{module.name}</p><p className="mt-1 text-sm font-bold">{module.completed} / {module.total} 已完成</p></div>)}</div></section>;
}
