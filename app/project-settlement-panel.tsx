'use client';

import { useState } from 'react';
import { settlementCandidates, taskSettlementPrice } from '@/lib/projects/settlement-logic';
import { ProjectData, SettlementBatch } from '@/types/project';

type Props = {
  project: ProjectData;
  updateDefaultUnitPrice: (amount: number) => void;
  closeMonth: (month: string) => void;
  updateSettlementBatch: (id: string, updates: Partial<Pick<SettlementBatch, 'adjustment' | 'invoiceDate' | 'invoiceNumber' | 'dueDate' | 'notes' | 'status'>>) => void;
  reopenSettlementBatch: (id: string) => void;
};

const money = (value: number) => `NT$ ${value.toLocaleString()}`;
const statusLabel = { draft: '待請款', invoiced: '已請款', paid: '已收款' } as const;
const taipeiMonth = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 7);

export function ProjectSettlementPanel({ project, updateDefaultUnitPrice, closeMonth, updateSettlementBatch, reopenSettlementBatch }: Props) {
  const [month, setMonth] = useState(taipeiMonth);
  const candidates = settlementCandidates(project, month);
  const candidateTotal = candidates.reduce((sum, task) => sum + taskSettlementPrice(project, task), 0);
  const batches = [...project.settlementBatches].sort((a, b) => b.month.localeCompare(a.month));
  const currentBatch = batches.find((batch) => batch.month === month);
  const zeroPriceCount = candidates.filter((task) => taskSettlementPrice(project, task) === 0).length;

  const close = () => {
    if (candidates.length === 0 || zeroPriceCount > 0 || (currentBatch && currentBatch.status !== 'draft')) return;
    if (window.confirm(`確定將 ${candidates.length} 支已交付影片納入 ${month} 月結，並從製作看板封存嗎？`)) closeMonth(month);
  };

  return <section className="mb-6 rounded-2xl border border-indigo-800/70 bg-slate-900/60 p-4 sm:p-5" aria-label="專案月結">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="font-bold">按支月結與追款</h2><p className="mt-1 text-xs text-slate-400">長期專案持續保留；每月只封存已交付影片，並獨立追蹤請款。</p></div><label className="text-xs font-bold text-slate-300">專案預設單價<input type="number" min="0" defaultValue={project.defaultUnitPrice} onBlur={(event) => updateDefaultUnitPrice(Math.max(0, Number(event.target.value) || 0))} className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-emerald-300 lg:w-40" /></label></header>

    <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><label className="text-xs font-bold text-slate-300">結算月份<input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} className="mt-2 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /></label><p className="mt-3 text-sm"><strong>{candidates.length} 支</strong>待結案 · 預估 <strong className="text-emerald-400">{money(candidateTotal)}</strong></p>{zeroPriceCount > 0 && <p className="mt-1 text-xs text-amber-300">其中 {zeroPriceCount} 支尚未設定價格，結案前請先確認單價。</p>}{currentBatch && <p className="mt-1 text-xs text-indigo-300">本月已有 {currentBatch.items.length} 支在月結內，目前為「{statusLabel[currentBatch.status]}」。</p>}</div><button onClick={close} disabled={candidates.length === 0 || zeroPriceCount > 0 || Boolean(currentBatch && currentBatch.status !== 'draft')} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">{currentBatch?.status === 'draft' ? '追加至本月月結' : '完成本月結案'}</button></div>
      {candidates.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{candidates.map((task) => <div key={task.id} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs"><p className="truncate font-semibold">{task.title}</p><p className="mt-1 text-slate-400">{money(taskSettlementPrice(project, task))}</p></div>)}</div>}
    </div>

    <div className="mt-5"><h3 className="text-sm font-bold">月份紀錄</h3>{batches.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-slate-800 py-6 text-center text-xs text-slate-500">尚未建立月結紀錄</p> : <div className="mt-3 space-y-3">{batches.map((batch) => <article key={batch.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{batch.month} · {batch.items.length} 支</p><p className="mt-1 text-lg font-black text-emerald-400">{money(batch.total)}</p></div><select value={batch.status} onChange={(event) => updateSettlementBatch(batch.id, { status: event.target.value as SettlementBatch['status'] })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="draft">待請款</option><option value="invoiced">已請款</option><option value="paid">已收款</option></select></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-slate-400">調整金額<input type="number" defaultValue={batch.adjustment} onBlur={(event) => updateSettlementBatch(batch.id, { adjustment: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label><label className="text-xs text-slate-400">請款編號<input defaultValue={batch.invoiceNumber ?? ''} onBlur={(event) => updateSettlementBatch(batch.id, { invoiceNumber: event.target.value.trim() || undefined })} placeholder="例如：INV-2026-09" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label><label className="text-xs text-slate-400">請款日<input type="date" value={batch.invoiceDate ?? ''} onChange={(event) => updateSettlementBatch(batch.id, { invoiceDate: event.target.value || undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label><label className="text-xs text-slate-400">付款期限<input type="date" value={batch.dueDate ?? ''} onChange={(event) => updateSettlementBatch(batch.id, { dueDate: event.target.value || undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label></div><details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">查看交付明細</summary><div className="mt-2 space-y-1">{batch.items.map((item) => <p key={item.taskId} className="flex justify-between gap-3"><span className="truncate">{item.title}</span><span className="shrink-0">{money(item.unitPrice)}</span></p>)}</div></details>{batch.status === 'draft' && <button onClick={() => window.confirm(`撤銷 ${batch.month} 月結並把影片放回看板嗎？`) && reopenSettlementBatch(batch.id)} className="mt-4 text-xs text-rose-400 hover:text-rose-300">撤銷月結</button>}</article>)}</div>}</div>
  </section>;
}
