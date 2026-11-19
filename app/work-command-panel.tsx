'use client';

import { useMemo, useState } from 'react';
import {
  isClosingSoon,
  isPendingInvoice,
  RECEIVABLE_PREVIEW_LIMIT,
  receivableUrgency,
  sortReceivableItems,
  sortWorkCommandItems,
  summarizeCommandItems,
  taipeiToday,
  WORK_PREVIEW_LIMIT,
  workCommandUrgency,
} from '@/lib/projects/work-command';
import { OpenProject, ProjectListItem, ReceivableItem, WorkCommandItem, WorkCommandUrgency } from '@/types/project';

type TaskFilter = 'all' | WorkCommandUrgency | 'waiting' | 'closing';
type ReceivableFilter = 'all' | 'pending' | 'invoiced';

const taskFilters = [
  ['all', '全部'], ['overdue', '逾期'], ['today', '今天'], ['upcoming', '近期'],
  ['unscheduled', '未排期'], ['waiting', '等客戶回覆'], ['closing', '即將結案'],
] as const;
const receivableFilters = [['all', '全部款項'], ['pending', '待請款'], ['invoiced', '已請款待收']] as const;

const rowClass = 'flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-left transition';

const money = (value: number) => `NT$ ${value.toLocaleString('zh-TW')}`;
const dateOnly = (value?: string) => value?.slice(0, 10) ?? '';

function formatDate(value?: string) {
  if (!value) return '未設定期限';
  return new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(new Date(`${dateOnly(value)}T00:00:00`));
}

function urgencyLabel(urgency: ReturnType<typeof workCommandUrgency>) {
  return urgency === 'overdue' ? '已逾期' : urgency === 'today' ? '今天' : urgency === 'upcoming' ? '近期待辦' : '未排期限';
}

function urgencyClass(urgency: ReturnType<typeof workCommandUrgency>) {
  return urgency === 'overdue'
    ? 'border-rose-700/70 bg-rose-950/40 text-rose-200'
    : urgency === 'today'
      ? 'border-amber-700/70 bg-amber-950/40 text-amber-200'
      : urgency === 'upcoming'
        ? 'border-indigo-700/60 bg-indigo-950/30 text-indigo-200'
        : 'border-slate-700 bg-slate-900 text-slate-300';
}

function receivableLabel(urgency: ReturnType<typeof receivableUrgency>) {
  return urgency === 'overdue' ? '已逾期' : urgency === 'dueSoon' ? '7 日內到期' : urgency === 'notDue' ? '待到期' : '未設定期限';
}

function receivableClass(urgency: ReturnType<typeof receivableUrgency>) {
  return urgency === 'overdue'
    ? 'border-rose-700/70 bg-rose-950/40 text-rose-200'
    : urgency === 'dueSoon'
      ? 'border-amber-700/70 bg-amber-950/40 text-amber-200'
      : 'border-slate-700 bg-slate-900 text-slate-300';
}

export function WorkCommandPanel({ projects, totalReceivable, showAmounts, onOpenProject }: {
  projects: ProjectListItem[];
  totalReceivable: number;
  showAmounts: boolean;
  onOpenProject: OpenProject;
}) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [receivableFilter, setReceivableFilter] = useState<ReceivableFilter>('all');
  const today = taipeiToday();
  const { allTasks, allReceivables, closing, counts } = useMemo(() => {
    const active = projects.filter((project) => !project.archivedAt);
    const allTasks = sortWorkCommandItems(active.flatMap((project) => project.workCommandItems ?? []));
    const allReceivables = sortReceivableItems(projects.flatMap((project) => project.receivableItems ?? []));
    const closing = active.filter((project) => isClosingSoon(project.plannedCloseDate, today))
      .sort((a, b) => (a.plannedCloseDate ?? '').localeCompare(b.plannedCloseDate ?? ''));
    const counts = summarizeCommandItems([], [], today).commandCounts;
    for (const project of projects) {
      const saved = project.commandCounts;
      const current = saved?.day === today ? saved : summarizeCommandItems(
        project.workCommandItems ?? [], project.receivableItems ?? [], today,
      ).commandCounts;
      if (!project.archivedAt) {
        counts.tasks.all += saved?.tasks.all ?? current.tasks.all;
        counts.tasks.waiting += saved?.tasks.waiting ?? current.tasks.waiting;
        counts.tasks.unscheduled += saved?.tasks.unscheduled ?? current.tasks.unscheduled;
        counts.tasks.overdue += current.tasks.overdue;
        counts.tasks.today += current.tasks.today;
        counts.tasks.upcoming += current.tasks.upcoming;
      }
      counts.receivables.all += saved?.receivables.all ?? current.receivables.all;
      counts.receivables.pending += saved?.receivables.pending ?? current.receivables.pending;
      counts.receivables.invoiced += saved?.receivables.invoiced ?? current.receivables.invoiced;
      counts.receivables.overdue += current.receivables.overdue;
      counts.receivables.dueSoon += current.receivables.dueSoon;
    }
    return { allTasks, allReceivables, closing, counts };
  }, [projects, today]);

  const visibleTasks = allTasks.filter((task) => {
    if (taskFilter === 'all') return true;
    if (taskFilter === 'waiting') return task.waitingForClient;
    return taskFilter === workCommandUrgency(task, today);
  }).slice(0, WORK_PREVIEW_LIMIT);
  const visibleReceivables = allReceivables.filter((item) => {
    if (receivableFilter === 'all') return true;
    return receivableFilter === 'pending' ? isPendingInvoice(item) : item.status === 'invoiced';
  }).slice(0, RECEIVABLE_PREVIEW_LIMIT);
  const hasOlderSummary = projects.some(({ commandCounts }) => commandCounts && commandCounts.day !== today);
  const taskCount = taskFilter === 'closing' ? closing.length : counts.tasks[taskFilter];
  const visibleCount = taskFilter === 'closing' ? Math.min(closing.length, WORK_PREVIEW_LIMIT) : visibleTasks.length;

  return (
    <section className="mb-6 rounded-2xl border border-indigo-800/70 bg-slate-900/60 p-4 sm:p-5" aria-label="每日工作指揮">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-bold">🧭 每日工作指揮</h2>
          <p className="mt-1 text-xs text-slate-400">今天 {formatDate(today)}，先處理逾期與今天到期的項目。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-rose-700/60 bg-rose-950/30 px-2.5 py-1 text-rose-200">逾期 {counts.tasks.overdue}</span>
          <span className="rounded-full border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 text-amber-200">今天 {counts.tasks.today}</span>
          <span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">待收 {counts.receivables.all} 筆</span>
        </div>
      </header>
      {hasOlderSummary && <p className="mt-2 text-xs text-amber-200">摘要已跨日，期限數字依目前可讀項目計算。重新整理可更新完整清單。</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-label="今日工作清單">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">工作清單</h3>
            <div className="flex flex-wrap gap-1" role="group" aria-label="工作篩選">
              {taskFilters.map(([value, label]) => (
                <FilterButton key={value} active={taskFilter === value} onClick={() => setTaskFilter(value)}>
                  {label}{value === 'waiting' && ` ${counts.tasks.waiting}`}{value === 'closing' && ` ${closing.length}`}
                </FilterButton>
              ))}
            </div>
          </div>
          {taskFilter === 'closing' && <p className="mt-2 text-xs text-slate-400">顯示 7 日內及已過預計結案日的專案。</p>}
          {visibleCount === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              {taskFilter === 'closing' ? '目前沒有即將結案的專案。可在專案摘要設定預計結案日。' : '這個篩選目前沒有待辦。'}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {taskFilter === 'closing'
                ? closing.slice(0, WORK_PREVIEW_LIMIT).map((project) => (
                  <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className={`${rowClass} hover:border-indigo-500`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{project.name}</span>
                      {project.clientName && <span className="mt-1 block truncate text-xs text-slate-400">{project.clientName}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-slate-300">
                      {project.plannedCloseDate && project.plannedCloseDate < today ? '已過預計日 · ' : '預計結案 · '}
                      {formatDate(project.plannedCloseDate)}
                    </span>
                  </button>
                ))
                : visibleTasks.map((task) => <CommandTask key={`${task.projectId}:${task.taskId}`} task={task} today={today} onOpenProject={onOpenProject} />)}
            </div>
          )}
          {taskCount > visibleCount && <p className="mt-3 text-center text-xs text-slate-400">顯示 {visibleCount}／{taskCount} 項，依期限排序。</p>}
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-label="跨專案追款">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold">💸 跨專案追款</h3>
            {showAmounts && <p className="text-right text-sm font-black text-emerald-300">待收 {money(totalReceivable)}</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-rose-950/40 px-2 py-1 text-rose-200">逾期 {counts.receivables.overdue}</span>
            <span className="rounded-md bg-amber-950/40 px-2 py-1 text-amber-200">7 日內 {counts.receivables.dueSoon}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="款項篩選">
            {receivableFilters.map(([value, label]) => (
              <FilterButton key={value} active={receivableFilter === value} onClick={() => setReceivableFilter(value)}>
                {label}{value !== 'all' && ` ${counts.receivables[value]}`}
              </FilterButton>
            ))}
          </div>
          {visibleReceivables.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">這個篩選目前沒有款項。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {visibleReceivables.map((item) => <ReceivableRow key={`${item.projectId}:${item.id}`} item={item} today={today} showAmounts={showAmounts} onOpenProject={onOpenProject} />)}
            </div>
          )}
          {counts.receivables[receivableFilter] > visibleReceivables.length && (
            <p className="mt-3 text-center text-xs text-slate-400">顯示 {visibleReceivables.length}／{counts.receivables[receivableFilter]} 筆，依期限排序。</p>
          )}
        </section>
      </div>
    </section>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-md px-2 py-1.5 text-xs ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
      {children}
    </button>
  );
}

function CommandTask({ task, today, onOpenProject }: { task: WorkCommandItem; today: string; onOpenProject: OpenProject }) {
  const urgency = workCommandUrgency(task, today);
  return <button type="button" onClick={() => onOpenProject(task.projectId, { moduleId: task.moduleId, taskId: task.taskId })} className={`${rowClass} hover:border-indigo-500`}><span className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${urgencyClass(urgency)}`}>{urgencyLabel(urgency)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{task.projectName}{task.clientName ? ` · ${task.clientName}` : ''} · {task.status}{task.waitingForClient && ' · 等客戶回覆'}</span></span><span className="shrink-0 text-xs text-slate-400">{formatDate(task.dueDate)}</span></button>;
}

function ReceivableRow({ item, today, showAmounts, onOpenProject }: { item: ReceivableItem; today: string; showAmounts: boolean; onOpenProject: OpenProject }) {
  const urgency = receivableUrgency(item, today);
  return <button type="button" onClick={() => onOpenProject(item.projectId, { moduleId: 'Finance' })} className={`${rowClass} hover:border-amber-500`}><span className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${receivableClass(urgency)}`}>{receivableLabel(urgency)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.projectName} · {item.status === 'invoiced' ? '已請款' : item.awaitingDelivery ? '待交付' : '待請款'}{item.invoiceNumber ? ` · ${item.invoiceNumber}` : ''}</span></span><span className="shrink-0 text-right text-xs text-slate-400"><span className="block">{showAmounts ? money(item.amount) : '金額隱藏'}</span><span className="mt-1 block">{formatDate(item.dueDate)}</span></span></button>;
}
