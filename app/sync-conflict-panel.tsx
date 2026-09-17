'use client';

import { projectFinancialSummary } from '@/lib/projects/project-summary';
import type { SyncConflict } from '@/hooks/useProjectData';

function snapshot(project: SyncConflict['local']) {
  const financial = projectFinancialSummary(project);
  const completed = project.tasks.filter((task) => {
    const statuses = project.moduleConfigs.find((config) => config.moduleId === task.moduleId)?.customStatuses ?? [];
    return task.status === statuses.at(-1);
  }).length;
  return { tasks: project.tasks.length, completed, payable: financial.outstandingPayable, receivable: financial.outstandingReceivable, version: project.syncVersion };
}

function VersionCard({ label, project, accent }: { label: string; project: SyncConflict['local'] | null; accent: string }) {
  if (!project) return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><p className="text-sm font-bold text-slate-400">{label}</p><p className="mt-4 text-xs text-slate-500">找不到雲端版本，可能已被刪除。</p></div>;
  const data = snapshot(project);
  return <div className={`rounded-xl border ${accent} bg-slate-950/60 p-4`}><p className="text-sm font-bold">{label}</p><p className="mt-1 truncate text-xs text-slate-400">{project.name}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">任務</dt><dd className="mt-1 text-base font-bold">{data.tasks}</dd></div><div><dt className="text-slate-500">已完成</dt><dd className="mt-1 text-base font-bold">{data.completed}</dd></div><div><dt className="text-slate-500">待收</dt><dd className="mt-1 text-amber-300">NT$ {data.receivable.toLocaleString()}</dd></div><div><dt className="text-slate-500">待付</dt><dd className="mt-1 text-rose-300">NT$ {data.payable.toLocaleString()}</dd></div></dl><p className="mt-4 break-all text-[10px] text-slate-600">版本：{data.version ?? '尚未同步'}</p></div>;
}

export function SyncConflictPanel({ conflict, message, onResolve }: { conflict: SyncConflict; message?: string | null; onResolve: (choice: 'cloud' | 'local') => void }) {
  return <section role="alert" aria-label="同步衝突處理" className="mb-6 rounded-2xl border border-rose-700/80 bg-rose-950/30 p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-rose-300">需要你決定</p><h2 className="mt-1 text-lg font-black text-rose-100">同一專案在其他裝置有新版本</h2><p className="mt-1 text-xs text-rose-200/80">{message || '為避免覆蓋資料，系統暫停自動同步。請比較兩個版本後選擇。'}</p></div><span className="rounded-full border border-rose-700/70 px-2 py-1 text-[10px] text-rose-300">未自動覆寫</span></div><div className="mt-4 grid gap-3 md:grid-cols-2"><VersionCard label="本機待同步" project={conflict.local} accent="border-indigo-800/70" /><VersionCard label="雲端目前版本" project={conflict.remote} accent="border-emerald-800/70" /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => onResolve('cloud')} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-600">採用雲端版本</button><button type="button" onClick={() => onResolve('local')} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold hover:bg-rose-600">保留本機並覆寫雲端</button></div><p className="mt-3 text-[11px] text-slate-500">選擇本機版本時，會以雲端最新版本號重新提交，避免再次誤蓋更新。</p></section>;
}
