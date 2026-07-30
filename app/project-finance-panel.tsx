'use client';

import { useEffect, useRef, useState } from 'react';
import { MonthlyFinanceReport } from '@/app/monthly-finance-report';
import { MonthlySettlement, ProjectData, Task, TransactionType } from '@/types/project';

type Props = {
  project: ProjectData;
  updateBudget: (amount: number) => void;
  addMonthlySettlement: () => void;
  updateMonthlySettlement: (id: string, updates: Partial<MonthlySettlement>) => void;
  deleteMonthlySettlement: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addTask: (title: string, moduleId: 'Finance', status: string, type?: TransactionType, amount?: number, linkedIncomeAmount?: number) => void;
  onBackToTasks: () => void;
};

const money = (value: number) => `NT$ ${value.toLocaleString()}`;

export function ProjectFinancePanel({ project, updateBudget, updateTask, deleteTask, addTask, onBackToTasks }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid'>('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const transactions = project.tasks.filter((task) => task.moduleId === 'Finance');
  const income = transactions.filter((task) => task.transactionType === 'income');
  const expenses = transactions.filter((task) => task.transactionType !== 'income');
  const isShortVideo = project.projectType === 'shortVideoEditing';
  const status = project.moduleConfigs.find((config) => config.moduleId === 'Finance')?.customStatuses[0] ?? '待處理';
  const monthlyGroups = [...income.reduce((groups, task) => {
    const month = (task.transactionDate ?? task.updatedAt).slice(0, 7);
    const group = groups.get(month) ?? { month, count: 0, total: 0, received: 0, pending: 0 };
    group.count += 1; group.total += task.amount;
    if (task.isPaid) group.received += task.amount; else group.pending += task.amount;
    groups.set(month, group); return groups;
  }, new Map<string, { month: string; count: number; total: number; received: number; pending: number }>()).values()].sort((a, b) => b.month.localeCompare(a.month));
  const visible = transactions.filter((task) => task.id !== pendingDelete).filter((task) =>
    (typeFilter === 'all' || (task.transactionType ?? 'expense') === typeFilter)
    && (statusFilter === 'all' || (statusFilter === 'paid' ? task.isPaid : !task.isPaid))
    && (!monthFilter || (task.transactionDate ?? task.dueDate ?? task.updatedAt).startsWith(monthFilter))
  );

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const add = (type: TransactionType) => {
    const title = window.prompt(type === 'income' ? '收入項目名稱' : '支出項目名稱');
    if (title?.trim()) addTask(title.trim(), 'Finance', status, type);
  };
  const scheduleDelete = (id: string) => {
    if (!window.confirm('確定刪除此收支項目嗎？6 秒內可復原。')) return;
    if (timer.current) window.clearTimeout(timer.current);
    setPendingDelete(id);
    timer.current = window.setTimeout(() => { deleteTask(id); setPendingDelete(null); }, 6000);
  };
  const exportCsv = () => {
    const rows = [['類型', '項目', '金額', '交易日', '到期日', '付款日', '狀態']];
    transactions.forEach((task) => rows.push([task.transactionType === 'income' ? '收入' : '支出', task.title, String(task.amount), task.transactionDate ?? '', task.dueDate ?? '', task.paidAt ?? '', task.isPaid ? '已完成' : '待處理']));
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${project.name}-財務.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <main className="finance-panel min-h-screen bg-slate-950 p-4 pb-24 text-slate-100 md:p-8 md:pb-8"><div className="mx-auto max-w-7xl">
    <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-slate-800 pb-6"><button onClick={onBackToTasks} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs">← 製作任務</button><div className="min-w-0 flex-1"><p className="truncate text-xs text-indigo-400">{project.name}</p><h1 className="text-2xl font-black">💰 財務帳目</h1></div><button onClick={exportCsv} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">匯出 CSV</button></header>
    <MonthlyFinanceReport tasks={transactions} />
    {isShortVideo ? <section className="mt-6 rounded-2xl border border-indigo-800 bg-slate-900/60 p-4 sm:p-5"><h2 className="font-bold">短影音月結（自動彙總）</h2><p className="mt-1 text-xs text-slate-400">由每支影片任務連動的收入項目自動計算。</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-slate-800 text-xs text-slate-400"><tr><th>月份</th><th>交付支數</th><th>月結金額</th><th>待收</th><th>已收</th></tr></thead><tbody>{monthlyGroups.map((group) => <tr key={group.month} className="border-b border-slate-800/70"><td className="py-3">{group.month}</td><td>{group.count} 支</td><td className="font-bold text-emerald-400">{money(group.total)}</td><td className="text-amber-300">{money(group.pending)}</td><td>{money(group.received)}</td></tr>)}</tbody></table></div></section> : <BudgetPanel project={project} expenses={expenses} updateBudget={updateBudget} />}
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">收支明細</h2><p className="mt-1 text-xs text-slate-400">完成任務的收入會標示「可收款」。</p></div><TransactionButtons add={add} className="hidden md:flex" /></div>
      <div className="mt-4 flex flex-wrap gap-2"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs sm:flex-none"><option value="all">全部收支</option><option value="income">收入</option><option value="expense">支出</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs sm:flex-none"><option value="all">全部狀態</option><option value="open">待處理</option><option value="paid">已完成</option></select><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs sm:w-auto" /></div>
      <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-800 text-xs text-slate-400"><tr><th>類型／項目</th><th>金額</th><th>交易日</th><th>到期日</th><th>憑證／備註</th><th>完成</th><th /></tr></thead><tbody>{visible.map((task) => <TransactionRow key={task.id} task={task} updateTask={updateTask} onDelete={() => scheduleDelete(task.id)} />)}</tbody></table></div>
      <div className="mt-4 space-y-3 md:hidden">{visible.map((task) => <TransactionCard key={task.id} task={task} updateTask={updateTask} onDelete={() => scheduleDelete(task.id)} />)}</div>
      {visible.length === 0 && <p className="py-10 text-center text-sm text-slate-500">沒有符合條件的收支項目</p>}
    </section>
  </div><div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-700 bg-slate-950/95 p-3 backdrop-blur md:hidden"><TransactionButtons add={add} className="flex" /></div>{pendingDelete && <div className="fixed bottom-20 left-4 right-4 z-30 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm shadow-xl md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2"><span>項目將在 6 秒後刪除</span><button onClick={() => { if (timer.current) window.clearTimeout(timer.current); setPendingDelete(null); }} className="shrink-0 font-bold text-indigo-400">復原</button></div>}</main>;
}

function TransactionButtons({ add, className }: { add: (type: TransactionType) => void; className: string }) { return <div className={`${className} w-full gap-2`}><button onClick={() => add('income')} className="flex-1 rounded-lg bg-emerald-700 px-3 py-3 text-xs font-bold md:flex-none">＋ 新增收入</button><button onClick={() => add('expense')} className="flex-1 rounded-lg bg-indigo-600 px-3 py-3 text-xs font-bold md:flex-none">＋ 新增支出</button></div>; }
function BudgetPanel({ project, expenses, updateBudget }: { project: ProjectData; expenses: Task[]; updateBudget: Props['updateBudget'] }) {
  const actual = expenses.filter((task) => task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const pending = expenses.filter((task) => !task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const remaining = project.budgetAmount - actual;
  return <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5"><h2 className="font-bold">成本控制（選用）</h2><p className="mt-1 text-xs text-slate-400">以單一專案總預算追蹤支出，不再區分腳本、拍攝與後期。</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="rounded-xl bg-slate-950/60 p-4 text-xs text-slate-400">專案總預算<input type="number" min="0" defaultValue={project.budgetAmount} onBlur={(event) => updateBudget(Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-base text-indigo-300" /></label><BudgetValue label="實際支出" amount={actual} /><BudgetValue label="待支付" amount={pending} /><BudgetValue label={remaining >= 0 ? '剩餘預算' : '超出預算'} amount={Math.abs(remaining)} color={remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'} /></div></section>;
}

function BudgetValue({ label, amount, color = 'text-slate-100' }: { label: string; amount: number; color?: string }) {
  return <div className="rounded-xl bg-slate-950/60 p-4"><p className="text-xs text-slate-400">{label}</p><p className={`mt-2 text-lg font-black ${color}`}>{money(amount)}</p></div>;
}
function TransactionRow({ task, updateTask, onDelete }: { task: Task; updateTask: (id: string, updates: Partial<Task>) => void; onDelete: () => void }) { const type = task.transactionType ?? 'expense'; const ready = type === 'income' && task.readyForCollection && !task.isPaid; return <tr className={`border-b border-slate-800/70 ${ready ? 'bg-amber-400/10' : ''}`}><td className="py-3"><select value={type} onChange={(event) => updateTask(task.id, { transactionType: event.target.value as TransactionType })} className="mr-2 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-xs"><option value="income">收入</option><option value="expense">支出</option></select><input defaultValue={task.title} onBlur={(event) => updateTask(task.id, { title: event.target.value.trim() || task.title })} className="w-32 bg-transparent" />{ready && <span className="ml-2 rounded bg-amber-400/20 px-2 py-1 text-xs text-amber-200">可收款</span>}</td><td><input type="number" min="0" defaultValue={task.amount} onBlur={(event) => updateTask(task.id, { amount: Math.max(0, Number(event.target.value) || 0) })} className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-emerald-400" /></td><td><input type="date" value={task.transactionDate ?? ''} onChange={(event) => updateTask(task.id, { transactionDate: event.target.value || undefined })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1" /></td><td><input type="date" value={task.dueDate ?? ''} onChange={(event) => updateTask(task.id, { dueDate: event.target.value || undefined })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1" /></td><td><input defaultValue={task.receiptUrl ?? task.description ?? ''} onBlur={(event) => updateTask(task.id, { receiptUrl: event.target.value.trim() || undefined })} placeholder="憑證連結／備註" className="w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1" /></td><td><label className="text-xs"><input type="checkbox" checked={task.isPaid} onChange={(event) => updateTask(task.id, { isPaid: event.target.checked, paidAt: event.target.checked ? new Date().toISOString() : undefined })} /> {type === 'income' ? '已收款' : '已支付'}</label></td><td><button onClick={onDelete} className="text-rose-400">刪除</button></td></tr>; }
function TransactionCard({ task, updateTask, onDelete }: { task: Task; updateTask: (id: string, updates: Partial<Task>) => void; onDelete: () => void }) { const [open, setOpen] = useState(false); const type = task.transactionType ?? 'expense'; const ready = type === 'income' && task.readyForCollection && !task.isPaid; return <article className={`rounded-xl border p-4 ${ready ? 'border-amber-500/50 bg-amber-400/10' : 'border-slate-800 bg-slate-950/50'}`}><button onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left"><div><p className={type === 'income' ? 'text-xs text-emerald-400' : 'text-xs text-indigo-300'}>{type === 'income' ? '收入' : '支出'} {ready && '· 已交付可收款'}</p><h3 className="mt-1 font-bold">{task.title}</h3><p className="mt-1 text-lg font-black text-emerald-400">{money(task.amount)}</p></div><span className="text-xs text-slate-400">{open ? '收合 ▲' : '編輯 ▼'}</span></button>{open && <div className="mt-4 space-y-3 border-t border-slate-800 pt-4"><label className="block text-xs">類型<select value={type} onChange={(event) => updateTask(task.id, { transactionType: event.target.value as TransactionType })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2"><option value="income">收入</option><option value="expense">支出</option></select></label><label className="block text-xs">項目<input defaultValue={task.title} onBlur={(event) => updateTask(task.id, { title: event.target.value.trim() || task.title })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2" /></label><label className="block text-xs">金額<input type="number" min="0" defaultValue={task.amount} onBlur={(event) => updateTask(task.id, { amount: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-emerald-400" /></label><label className="block text-xs">交易日<input type="date" value={task.transactionDate ?? ''} onChange={(event) => updateTask(task.id, { transactionDate: event.target.value || undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2" /></label><label className="block text-xs">備註<input defaultValue={task.receiptUrl ?? task.description ?? ''} onBlur={(event) => updateTask(task.id, { receiptUrl: event.target.value.trim() || undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2" /></label><div className="flex items-center justify-between"><label className="text-sm"><input type="checkbox" checked={task.isPaid} onChange={(event) => updateTask(task.id, { isPaid: event.target.checked, paidAt: event.target.checked ? new Date().toISOString() : undefined })} /> {type === 'income' ? '已收款' : '已支付'}</label><button onClick={onDelete} className="text-sm text-rose-400">刪除</button></div></div>}</article>; }
