'use client';

import { Amount, AmountInput, AmountToggle } from './amount-visibility';
import { useEffect, useRef, useState } from 'react';
import { MonthlyFinanceReport } from '@/app/monthly-finance-report';
import { summarizeSettlements } from '@/lib/projects/settlement-logic';
import { ProjectData, Task, TransactionType } from '@/types/project';

type Props = {
  settlementPanel: React.ReactNode;
  project: ProjectData;
  updateBudget: (amount: number) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addTask: (title: string, moduleId: 'Finance', status: string, type?: TransactionType, amount?: number, linkedIncomeAmount?: number) => void;
  onBackToTasks: () => void;
  onBack: () => void;
  saving: boolean;
  syncFeedback: React.ReactNode;
  conflictFeedback: React.ReactNode;
};



export function ProjectFinancePanel({ project, settlementPanel, updateBudget, updateTask, deleteTask, addTask, onBackToTasks, onBack, saving, syncFeedback, conflictFeedback }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid'>('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const transactions = project.tasks.filter((task) => task.moduleId === 'Finance');
  const lockedBatches = new Set(project.settlementBatches.filter((batch) => batch.status !== 'draft').map((batch) => batch.id));
  const pendingBatches = project.settlementBatches.filter((batch) => batch.status !== 'paid')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.month.localeCompare(b.month));
  const settlementTotals = summarizeSettlements(project.settlementBatches);
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

  return <main className="finance-panel min-h-screen bg-work-canvas p-4 pb-24 text-work-ink tabular-nums md:p-8 md:pb-8"><div className="mx-auto max-w-[100rem]">
    <header className="workspace-header finance-head mb-3">
      <div className="min-w-0 md:flex-1">
        <p className="truncate text-xs text-work-link">{project.name}</p>
        <h1 className="workspace-heading font-semibold">財務帳目</h1>
        {syncFeedback}
      </div>
      <nav aria-label="財務頁導覽" className="finance-back-links flex min-w-0 flex-wrap gap-1">
        <button type="button" onClick={onBackToTasks} className="workspace-button px-2 py-2 text-xs">← 製作任務</button>
        <button type="button" onClick={onBack} disabled={saving} className="workspace-button px-2 py-2 text-xs disabled:opacity-50">← 返回大廳</button>
      </nav>
      <div className="finance-header-actions flex flex-wrap items-center justify-end"><AmountToggle /><button type="button" onClick={exportCsv} className="workspace-button px-3 py-2 text-xs md:order-3">匯出 CSV</button></div>
    </header>
    <nav aria-label="財務區塊" className="finance-links"><a href="#monthly-settlement">月結與追款</a><a href="#monthly-report">收付月報</a><a href="#transactions">收支明細</a></nav>
    {conflictFeedback}

    {project.settlementBatches.length > 0 && <section className="workspace-panel my-5 p-4 sm:p-5"><h2 className="font-bold">專案月結追款</h2><p className="mt-1 text-xs text-work-muted">每個月份獨立請款，不與同一客戶的其他專案合併。</p><div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <BudgetValue label="待請款" amount={settlementTotals.draft} />
      <BudgetValue label="已請款未收" amount={settlementTotals.invoiced} />
      <BudgetValue label="已收款" amount={settlementTotals.paid} />
      <BudgetValue label="已請款中逾期" amount={settlementTotals.overdue} color="text-work-danger" />
    </div>{pendingBatches.length > 0 && <ul className="mt-4 divide-y divide-work-line border-t border-work-line">{pendingBatches.map((batch) => (
      <li key={batch.id}><a href={`#batch-${batch.id}`} className="followup-row">
        <span><strong>{batch.month} 月結</strong><small>{batch.invoiceNumber || (batch.status === 'draft' ? '待請款' : '已請款')}</small></span>
        <span>{batch.dueDate || '未設期限'}</span><strong><Amount value={batch.total} /></strong>
      </a></li>
    ))}</ul>}</section>}
    <MonthlyFinanceReport tasks={transactions} />
    {settlementPanel}
    {isShortVideo ? <section className="workspace-panel my-5 p-4 sm:p-5"><h2 className="font-bold">短影音月結（自動彙總）</h2><p className="mt-1 text-xs text-work-muted">由每支影片任務連動的收入項目自動計算。</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-work-line text-xs text-work-muted"><tr><th>月份</th><th>交付支數</th><th>月結金額</th><th>待收</th><th>已收</th></tr></thead><tbody>{monthlyGroups.map((group) => <tr key={group.month} className="border-b border-work-line"><td className="py-3">{group.month}</td><td>{group.count} 支</td><td className="font-bold text-work-positive"><Amount value={group.total} /></td><td className="text-work-warning"><Amount value={group.pending} /></td><td><Amount value={group.received} /></td></tr>)}</tbody></table></div></section> : <BudgetPanel project={project} expenses={expenses} updateBudget={updateBudget} />}
    <section id="transactions" className="workspace-panel my-5 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">收支明細</h2><p className="mt-1 text-xs text-work-muted">完成任務的收入會標示「可收款」。</p></div><TransactionButtons add={add} className="hidden md:flex" /></div>
      <div className="mt-4 flex flex-wrap gap-2"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="min-w-0 flex-1 rounded border border-work-control bg-work-paper px-2 py-2 text-xs sm:flex-none"><option value="all">全部收支</option><option value="income">收入</option><option value="expense">支出</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="min-w-0 flex-1 rounded border border-work-control bg-work-paper px-2 py-2 text-xs sm:flex-none"><option value="all">全部狀態</option><option value="open">待處理</option><option value="paid">已完成</option></select><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="w-full rounded border border-work-control bg-work-paper px-2 py-2 text-xs sm:w-auto" /></div>
      <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-work-line text-xs text-work-muted"><tr><th>類型／項目</th><th>金額</th><th>交易日</th><th>到期日</th><th>憑證／備註</th><th>完成</th><th /></tr></thead><tbody>{visible.map((task) => <TransactionRow key={task.id} task={task} locked={Boolean(task.settlementBatchId && lockedBatches.has(task.settlementBatchId))} updateTask={updateTask} onDelete={() => scheduleDelete(task.id)} />)}</tbody></table></div>
      <div className="mt-4 space-y-3 md:hidden">{visible.map((task) => <TransactionCard key={task.id} task={task} locked={Boolean(task.settlementBatchId && lockedBatches.has(task.settlementBatchId))} updateTask={updateTask} onDelete={() => scheduleDelete(task.id)} />)}</div>
      {visible.length === 0 && <p className="py-10 text-center text-sm text-work-muted">沒有符合條件的收支項目</p>}
    </section>
  </div><div className="fixed inset-x-0 bottom-0 z-20 border-t border-work-control bg-work-paper p-3 backdrop-blur md:hidden"><TransactionButtons add={add} className="flex" /></div>{pendingDelete && <div className="fixed bottom-20 left-4 right-4 z-30 flex items-center justify-between gap-3 rounded-xl border border-work-control bg-work-surface px-4 py-3 text-sm shadow-xl md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2"><span>項目將在 6 秒後刪除</span><button onClick={() => { if (timer.current) window.clearTimeout(timer.current); setPendingDelete(null); }} className="workspace-button shrink-0 font-bold px-2 py-1">復原</button></div>}</main>;
}

function TransactionButtons({ add, className }: { add: (type: TransactionType) => void; className: string }) { return <div className={`${className} w-full gap-2`}><button onClick={() => add('income')} className="workspace-button workspace-button--primary flex-1 px-3 py-3 text-xs font-bold md:flex-none">＋ 新增收入</button><button onClick={() => add('expense')} className="workspace-button flex-1 px-3 py-3 text-xs font-bold md:flex-none">＋ 新增支出</button></div>; }
function BudgetPanel({ project, expenses, updateBudget }: { project: ProjectData; expenses: Task[]; updateBudget: Props['updateBudget'] }) {
  const actual = expenses.filter((task) => task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const pending = expenses.filter((task) => !task.isPaid).reduce((sum, task) => sum + task.amount, 0);
  const remaining = project.budgetAmount - actual;
  return <section className="workspace-panel my-5 p-4 sm:p-5"><h2 className="font-bold">成本控制（選用）</h2><p className="mt-1 text-xs text-work-muted">以單一專案總預算追蹤支出，不再區分腳本、拍攝與後期。</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="rounded-xl bg-work-paper p-4 text-xs text-work-muted">專案總預算<AmountInput min="0" defaultValue={project.budgetAmount} onBlur={(event) => updateBudget(Math.max(0, Number(event.target.value) || 0))} className="mt-2 w-full rounded border border-work-control bg-work-paper px-2 py-2 text-base text-work-link" /></label><BudgetValue label="實際支出" amount={actual} /><BudgetValue label="待支付" amount={pending} /><BudgetValue label={remaining >= 0 ? '剩餘預算' : '超出預算'} amount={Math.abs(remaining)} color={remaining >= 0 ? 'text-work-positive' : 'text-work-danger'} /></div></section>;
}

function BudgetValue({ label, amount, color = 'text-work-ink' }: { label: string; amount: number; color?: string }) {
  return <div className="rounded-xl bg-work-paper p-4"><p className="text-xs text-work-muted">{label}</p><p className={`workspace-metric mt-2 ${color}`}><Amount value={amount} /></p></div>;
}
function TransactionRow({ task, locked, updateTask, onDelete }: { task: Task; locked: boolean; updateTask: (id: string, updates: Partial<Task>) => void; onDelete: () => void }) { const type = task.transactionType ?? 'expense'; const ready = type === 'income' && task.readyForCollection && !task.isPaid; return <tr className={`border-b border-work-line ${ready ? 'bg-work-warning-bg' : ''}`}><td className="py-3"><select disabled={locked} value={type} onChange={(event) => updateTask(task.id, { transactionType: event.target.value as TransactionType })} className="mr-2 rounded border border-work-control bg-work-paper px-1 py-1 text-xs"><option value="income">收入</option><option value="expense">支出</option></select><input defaultValue={task.title} onBlur={(event) => updateTask(task.id, { title: event.target.value.trim() || task.title })} className="w-32 bg-transparent" />{ready && <span className="ml-2 rounded bg-work-warning-bg px-2 py-1 text-xs text-work-warning">可收款</span>}</td><td><AmountInput min="0" disabled={locked} defaultValue={task.amount} onBlur={(event) => updateTask(task.id, { amount: Math.max(0, Number(event.target.value) || 0) })} className="w-24 rounded border border-work-control bg-work-paper px-2 py-1 text-work-positive" /></td><td><input type="date" value={task.transactionDate ?? ''} onChange={(event) => updateTask(task.id, { transactionDate: event.target.value || undefined })} className="rounded border border-work-control bg-work-paper px-2 py-1" /></td><td><input type="date" value={task.dueDate ?? ''} onChange={(event) => updateTask(task.id, { dueDate: event.target.value || undefined })} className="rounded border border-work-control bg-work-paper px-2 py-1" /></td><td><input defaultValue={task.receiptUrl ?? task.description ?? ''} onBlur={(event) => updateTask(task.id, { receiptUrl: event.target.value.trim() || undefined })} placeholder="憑證連結／備註" className="w-36 rounded border border-work-control bg-work-paper px-2 py-1" /></td><td><label className="text-xs"><input type="checkbox" disabled={locked} checked={task.isPaid} onChange={(event) => updateTask(task.id, { isPaid: event.target.checked, paidAt: event.target.checked ? new Date().toISOString() : undefined })} /> {type === 'income' ? '已收款' : '已支付'}</label></td><td><button disabled={locked} onClick={onDelete} className="workspace-button workspace-button--danger px-2 py-1">刪除</button></td></tr>; }
function TransactionCard({ task, locked, updateTask, onDelete }: { task: Task; locked: boolean; updateTask: (id: string, updates: Partial<Task>) => void; onDelete: () => void }) { const [open, setOpen] = useState(false); const type = task.transactionType ?? 'expense'; const ready = type === 'income' && task.readyForCollection && !task.isPaid; return <article className={`rounded-xl border p-4 ${ready ? 'border-work-warning-line bg-work-warning-bg' : 'border-work-line bg-work-paper'}`}><button onClick={() => setOpen((value) => !value)} className="workspace-button flex w-full items-start justify-between gap-3 text-left px-2 py-1"><div><p className={type === 'income' ? 'text-xs text-work-positive' : 'text-xs text-work-link'}>{type === 'income' ? '收入' : '支出'} {ready && '· 已交付可收款'}</p><h3 className="mt-1 font-bold">{task.title}</h3><p className="mt-1 text-lg font-black text-work-positive"><Amount value={task.amount} /></p></div><span className="text-xs text-work-muted">{open ? '收合 ▲' : '編輯 ▼'}</span></button>{open && <div className="mt-4 space-y-3 border-t border-work-line pt-4"><label className="block text-xs">類型<select disabled={locked} value={type} onChange={(event) => updateTask(task.id, { transactionType: event.target.value as TransactionType })} className="mt-1 w-full rounded border border-work-control bg-work-paper px-2 py-2"><option value="income">收入</option><option value="expense">支出</option></select></label><label className="block text-xs">項目<input defaultValue={task.title} onBlur={(event) => updateTask(task.id, { title: event.target.value.trim() || task.title })} className="mt-1 w-full rounded border border-work-control bg-work-paper px-2 py-2" /></label><label className="block text-xs">金額<AmountInput min="0" disabled={locked} defaultValue={task.amount} onBlur={(event) => updateTask(task.id, { amount: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded border border-work-control bg-work-paper px-2 py-2 text-work-positive" /></label><label className="block text-xs">交易日<input type="date" value={task.transactionDate ?? ''} onChange={(event) => updateTask(task.id, { transactionDate: event.target.value || undefined })} className="mt-1 w-full rounded border border-work-control bg-work-paper px-2 py-2" /></label><label className="block text-xs">備註<input defaultValue={task.receiptUrl ?? task.description ?? ''} onBlur={(event) => updateTask(task.id, { receiptUrl: event.target.value.trim() || undefined })} className="mt-1 w-full rounded border border-work-control bg-work-paper px-2 py-2" /></label><div className="flex items-center justify-between"><label className="text-sm"><input type="checkbox" disabled={locked} checked={task.isPaid} onChange={(event) => updateTask(task.id, { isPaid: event.target.checked, paidAt: event.target.checked ? new Date().toISOString() : undefined })} /> {type === 'income' ? '已收款' : '已支付'}</label><button disabled={locked} onClick={onDelete} className="workspace-button workspace-button--danger text-sm px-2 py-1">刪除</button></div></div>}</article>; }
