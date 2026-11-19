'use client';

import { ModuleId, WORKSPACE_MODULES } from '@/types/project';

export function ProjectWorkspaceNavigation({ activeModule, onChange }: { activeModule: ModuleId; onChange: (moduleId: ModuleId) => void }) {
  return (
    <nav aria-label="專案功能" className="project-workspace-nav flex gap-2 border-b border-work-line py-2">
      {WORKSPACE_MODULES.map((module) => (
        <button key={module.id} type="button" aria-pressed={activeModule === module.id}
          onClick={() => onChange(module.id)} className="workspace-filter px-4 py-3 text-center text-sm font-semibold">
          {module.id === 'Finance' ? '財務帳目' : '製作任務'}
        </button>
      ))}
    </nav>
  );
}

export function ProjectSummary({ activeCount, completionRate, nextDue }: { activeCount: number; completionRate: number; nextDue?: string }) {
  return <dl className="project-facts" aria-label="專案摘要">
    <div><dt>進行中任務</dt><dd>{activeCount} <small>項</small></dd></div>
    <div><dt>最近期限</dt><dd>{nextDue || '未排期'}</dd></div>
    <div><dt>製作完成度</dt><dd>{completionRate}<small> %</small></dd></div>
  </dl>;
}
