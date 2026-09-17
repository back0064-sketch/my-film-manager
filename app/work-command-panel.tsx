'use client';

import { useMemo, useState } from 'react';
import {
  receivableUrgency,
  sortWorkCommandItems,
  taipeiToday,
  workCommandUrgency,
} from '@/lib/projects/work-command';
import { ProjectListItem, ReceivableItem, WorkCommandItem } from '@/types/project';

type TaskFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'unscheduled';

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

export function WorkCommandPanel({ projects, showAmounts, onOpenProject }: { projects: ProjectListItem[]; showAmounts: boolean; onOpenProject: (id: string) => void }) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const today = taipeiToday();
  const allTasks = useMemo(() => sortWorkCommandItems(projects.flatMap((project) => project.workCommandItems ?? []), today), [projects, today]);
  const allReceivables = useMemo(() => projects.flatMap((project) => project.receivableItems ?? []).sort((a, b) => {
    const aDue = dateOnly(a.dueDate);
    const bDue = dateOnly(b.dueDate);
    if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  }), [projects]);
  const visibleTasks = allTasks.filter((task) => taskFilter === 'all' || workCommandUrgency(task, today) === taskFilter).slice(0, 12);
  const overdueCount = allTasks.filter((task) => workCommandUrgency(task, today) === 'overdue').length;
  const todayCount = allTasks.filter((task) => workCommandUrgency(task, today) === 'today').length;
  const receivableOverdueCount = allReceivables.filter((item) => receivableUrgency(item, today) === 'overdue').length;
  const receivableSoonCount = allReceivables.filter((item) => receivableUrgency(item, today) === 'dueSoon').length;
  const receivableTotal = allReceivables.reduce((sum, item) => sum + item.amount, 0);

  return <section className="mb-6 rounded-2xl border border-indigo-800/70 bg-slate-900/60 p-4 sm:p-5" aria-label="每日工作指揮">
    <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold">🧭 每日工作指揮</h2><p className="mt-1 text-xs text-slate-400">今天 {formatDate(today)}，先處理逾期與今天到期的項目。</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-rose-700/60 bg-rose-950/30 px-2.5 py-1 text-rose-200">逾期 {overdueCount}</span><span className="rounded-full border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 text-amber-200">今天 {todayCount}</span><span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">待收 {allReceivables.length} 筆</span></div></header>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-label="今日工作清單"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">工作清單</h3><div className="flex flex-wrap gap-1">{([['all', '全部'], ['overdue', '逾期'], ['today', '今天'], ['upcoming', '近期'], ['unscheduled', '未排期']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)} className={`rounded-md px-2 py-1 text-xs ${taskFilter === value ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>{label}</button>)}</div></div>{visibleTasks.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">這個篩選目前沒有待辦，換個篩選或回到專案補上期限。</p> : <div className="mt-3 space-y-2">{visibleTasks.map((task) => <CommandTask key={`${task.projectId}:${task.taskId}`} task={task} today={today} onOpenProject={onOpenProject} />)}</div>}{allTasks.length > 12 && <p className="mt-3 text-center text-[11px] text-slate-500">顯示最需要先處理的 12 項；其餘請進入專案看板。</p>}</section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-label="跨專案追款"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold">💸 跨專案追款</h3><p className="mt-1 text-xs text-slate-500">每個專案、每個月結分開追蹤。</p></div>{showAmounts && <p className="text-right text-sm font-black text-emerald-300">{money(receivableTotal)}</p>}</div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-rose-950/40 px-2 py-1 text-rose-200">逾期 {receivableOverdueCount}</span><span className="rounded-md bg-amber-950/40 px-2 py-1 text-amber-200">7 日內 {receivableSoonCount}</span></div>{allReceivables.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">目前沒有待追款項目。</p> : <div className="mt-3 space-y-2">{allReceivables.slice(0, 8).map((item) => <ReceivableRow key={`${item.projectId}:${item.id}`} item={item} today={today} showAmounts={showAmounts} onOpenProject={onOpenProject} />)}</div>}{allReceivables.length > 8 && <p className="mt-3 text-center text-[11px] text-slate-500">顯示最早到期的 8 筆；完整資料請進入各專案財務頁。</p>}</section>
    </div>
  </section>;
}

function CommandTask({ task, today, onOpenProject }: { task: WorkCommandItem; today: string; onOpenProject: (id: string) => void }) {
  const urgency = workCommandUrgency(task, today);
  return <button type="button" onClick={() => onOpenProject(task.projectId)} className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-indigo-500"><span className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${urgencyClass(urgency)}`}>{urgencyLabel(urgency)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{task.projectName}{task.clientName ? ` · ${task.clientName}` : ''} · {task.status}</span></span><span className="shrink-0 text-xs text-slate-400">{formatDate(task.dueDate)}</span></button>;
}

function ReceivableRow({ item, today, showAmounts, onOpenProject }: { item: ReceivableItem; today: string; showAmounts: boolean; onOpenProject: (id: string) => void }) {
  const urgency = receivableUrgency(item, today);
  return <button type="button" onClick={() => onOpenProject(item.projectId)} className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-amber-500"><span className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${receivableClass(urgency)}`}>{receivableLabel(urgency)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.projectName}{item.invoiceNumber ? ` · ${item.invoiceNumber}` : ''}</span></span><span className="shrink-0 text-right text-xs text-slate-400"><span className="block">{showAmounts ? money(item.amount) : '金額隱藏'}</span><span className="mt-1 block">{formatDate(item.dueDate)}</span></span></button>;
}
