'use client';

import { useState } from 'react';
import { buildMonthlyFinanceReport, currentMonth, shiftMonth } from '@/lib/projects/finance-report';
import { Task } from '@/types/project';

const money = (value: number) => `NT$ ${value.toLocaleString()}`;
const date = (value?: string) => value ? value.slice(0, 10) : '—';

export function MonthlyFinanceReport({ tasks }: { tasks: Task[] }) {
  const [month, setMonth] = useState(() => currentMonth());
  const report = buildMonthlyFinanceReport(tasks, month);

  return <section className="rounded-2xl border border-indigo-800/70 bg-slate-900/60 p-4 sm:p-5" aria-label="月份財務報表">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-bold">月份財務報表</h2><p className="mt-1 text-xs text-slate-400">已收、已付依實際完成日期計算；未結清統計截至該月底。</p></div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="上一個月" className="rounded-lg border border-slate-700 px-3 py-2 text-sm">‹</button>
        <input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} aria-label="報表月份" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm sm:flex-none" />
        <button type="button" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label="下一個月" className="rounded-lg border border-slate-700 px-3 py-2 text-sm">›</button>
      </div>
    </header>

    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ReportValue label="本月已收" amount={report.received} color="text-emerald-400" />
      <ReportValue label="本月已付" amount={report.paid} color="text-rose-300" />
      <ReportValue label="本月淨現金流" amount={report.netCashFlow} color={report.netCashFlow >= 0 ? 'text-indigo-300' : 'text-rose-400'} signed />
      <ReportValue label="月底未結清" amount={report.outstandingReceivable + report.outstandingPayable} color="text-amber-300" />
    </div>

    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-slate-400">未收款 <strong className="ml-1 text-amber-300">{money(report.outstandingReceivable)}</strong></p>
      <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-slate-400">未支付 <strong className="ml-1 text-rose-300">{money(report.outstandingPayable)}</strong></p>
    </div>
    {report.undatedCompleted.length > 0 && <p className="mt-3 rounded-lg border border-amber-700/60 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">有 {report.undatedCompleted.length} 筆舊的已完成項目缺少實際收付日，因此暫不列入月份現金流。可取消完成後重新勾選，以記錄日期。</p>}

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <ReportList title="本月實際收付款" empty="本月尚無已完成的收付款" tasks={report.completed} dateField="paidAt" />
      <ReportList title="截至月底未結清" empty="截至月底沒有未結清項目" tasks={report.outstanding} dateField="dueDate" />
    </div>
  </section>;
}

function ReportValue({ label, amount, color, signed = false }: { label: string; amount: number; color: string; signed?: boolean }) {
  const prefix = signed && amount > 0 ? '+' : '';
  return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs text-slate-400">{label}</p><p className={`mt-2 text-lg font-black ${color}`}>{prefix}{money(amount)}</p></div>;
}

function ReportList({ title, empty, tasks, dateField }: { title: string; empty: string; tasks: Task[]; dateField: 'paidAt' | 'dueDate' }) {
  return <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><h3 className="text-sm font-bold">{title}</h3>{tasks.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">{empty}</p> : <div className="mt-3 divide-y divide-slate-800">{tasks.map((task) => <div key={task.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold">{task.title}</p><p className="mt-1 text-xs text-slate-500">{dateField === 'paidAt' ? '完成日' : '到期日'}：{date(task[dateField] ?? task.transactionDate)}</p></div><div className="shrink-0 text-right"><p className={task.transactionType === 'income' ? 'font-bold text-emerald-400' : 'font-bold text-rose-300'}>{task.transactionType === 'income' ? '+' : '−'}{money(task.amount)}</p><p className="mt-1 text-xs text-slate-500">{task.transactionType === 'income' ? '收入' : '支出'}</p></div></div>)}</div>}</section>;
}
