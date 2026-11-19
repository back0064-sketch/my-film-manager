'use client';

import { useState } from 'react';
import { deliveriesMissingDate, settlementCandidates, taipeiDeliveryDate, taskSettlementPrice } from '@/lib/projects/settlement-logic';
import { ProjectData, SettlementBatch } from '@/types/project';

type Props = {
  project: ProjectData;
  updateDefaultUnitPrice: (amount: number) => void;
  closeMonth: (month: string) => void;
  updateSettlementBatch: (id: string, updates: Partial<Pick<SettlementBatch, 'adjustment' | 'invoiceDate' | 'invoiceNumber' | 'dueDate' | 'notes' | 'status'>>) => void;
  reopenSettlementBatch: (id: string) => void;
  withdrawInvoice: (id: string) => void;
  setDeliveryDate: (taskId: string, date: string) => boolean;
  recordCoveredDelivery: (batchId: string, taskId: string) => boolean;
};

const money = (value: number) => `NT$ ${value.toLocaleString()}`;
const statusLabel = { draft: '待請款', invoiced: '已請款', paid: '已收款' } as const;
const taipeiMonth = () => taipeiDeliveryDate(new Date().toISOString()).slice(0, 7);

function DeliveryDateForm({ title, date, onSave }: { title: string; date?: string; onSave: (date: string) => void }) {
  return <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('deliveredAt');
    if (typeof value === 'string' && taipeiDeliveryDate(value)) onSave(value);
  }}>
    <label className="text-xs text-slate-400">交付日期
      <input key={date} type="date" name="deliveredAt" required defaultValue={date} aria-label={`${title}的交付日期`} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs" />
    </label>
    <button className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800">儲存日期</button>
  </form>;
}

export function ProjectSettlementPanel({ project, updateDefaultUnitPrice, closeMonth, updateSettlementBatch, reopenSettlementBatch, withdrawInvoice, setDeliveryDate, recordCoveredDelivery }: Props) {
  const [month, setMonth] = useState(taipeiMonth);
  const [message, setMessage] = useState('');
  const [confirmTaskId, setConfirmTaskId] = useState<string | null>(null);
  const candidates = settlementCandidates(project, month);
  const pendingDates = deliveriesMissingDate(project);
  const candidateTotal = candidates.reduce((sum, task) => sum + taskSettlementPrice(project, task), 0);
  const batches = [...project.settlementBatches].sort((a, b) => b.month.localeCompare(a.month));
  const currentBatch = batches.find((batch) => batch.month === month);
  const zeroPriceCount = candidates.filter((task) => taskSettlementPrice(project, task) === 0).length;

  const saveDeliveryDate = (taskId: string, date: string) => {
    if (setDeliveryDate(taskId, date)) {
      setMonth(date.slice(0, 7));
      setConfirmTaskId(null);
      setMessage('已修正交付日期。');
    }
  };

  const recordIncluded = (taskId: string) => {
    if (currentBatch?.status !== 'paid') return;
    setConfirmTaskId(null);
    setMessage(recordCoveredDelivery(currentBatch.id, taskId)
      ? '已補登至原批並封存影片。'
      : '無法補登。請確認這支影片是否已經綁定其他月結。');
  };

  const close = () => {
    if (candidates.length === 0 || zeroPriceCount > 0 || (currentBatch && currentBatch.status !== 'draft')) return;
    if (window.confirm(`確定將 ${candidates.length} 支已交付影片納入 ${month} 月結，並從製作看板封存嗎？`)) closeMonth(month);
  };

  return <section className="mb-6 rounded-2xl border border-indigo-800/70 bg-slate-900/60 p-4 sm:p-5" aria-label="專案月結">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="font-bold">按支月結與追款</h2><p className="mt-1 text-xs text-slate-400">長期專案持續保留；每月只封存已交付影片，並獨立追蹤請款。</p></div><label className="text-xs font-bold text-slate-300">專案預設單價<input type="number" min="0" defaultValue={project.defaultUnitPrice} onBlur={(event) => updateDefaultUnitPrice(Math.max(0, Number(event.target.value) || 0))} className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-emerald-300 lg:w-40" /></label></header>

    <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><label className="text-xs font-bold text-slate-300">結算月份<input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} className="mt-2 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /></label><p className="mt-3 text-sm"><strong>{candidates.length} 支</strong>待結案 · 預估 <strong className="text-emerald-400">{money(candidateTotal)}</strong></p>{zeroPriceCount > 0 && <p className="mt-1 text-xs text-amber-300">其中 {zeroPriceCount} 支尚未設定價格，結案前請先確認單價。</p>}{currentBatch && <p className="mt-1 text-xs text-indigo-300">本月已有 {currentBatch.items.length} 支在月結內，目前為「{statusLabel[currentBatch.status]}」。</p>}</div><button onClick={close} disabled={candidates.length === 0 || zeroPriceCount > 0 || Boolean(currentBatch && currentBatch.status !== 'draft')} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">{currentBatch?.status === 'draft' ? '追加至本月月結' : '完成本月結案'}</button></div>
      {message && <p role="status" className="mt-3 text-sm text-indigo-200">{message}</p>}
      {candidates.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{candidates.map((task) => <div key={task.id} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
        <p className="truncate font-semibold">{task.title}</p>
        <p className="mt-1 text-slate-400">{money(taskSettlementPrice(project, task))} · {taipeiDeliveryDate(task.deliveredAt)} 交付</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-indigo-300">修正交付日期</summary>
          <div className="mt-2"><DeliveryDateForm title={task.title} date={taipeiDeliveryDate(task.deliveredAt)} onSave={(date) => saveDeliveryDate(task.id, date)} /></div>
        </details>
        {currentBatch?.status === 'paid' && (confirmTaskId === task.id
          ? <div className="mt-3 rounded-lg border border-emerald-900 p-2">
            <p className="text-emerald-300">確認這支影片已含在 {month} 原批收款。補登後另計金額為 0 元。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded bg-emerald-800 px-3 py-2 text-white" onClick={() => recordIncluded(task.id)}>確認補登</button>
              <button type="button" className="rounded px-3 py-2 text-slate-300" onClick={() => setConfirmTaskId(null)}>取消補登</button>
            </div>
          </div>
          : <button type="button" className="mt-3 rounded-lg border border-emerald-800 px-3 py-2 text-emerald-300 hover:bg-emerald-950" onClick={() => setConfirmTaskId(task.id)}>補登至已收款月結</button>)}
      </div>)}</div>}
    </div>

    {pendingDates.length > 0 && <details className="mt-4 rounded-xl border border-amber-900/70 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-amber-300">待確認交付日期 · {pendingDates.length} 支</summary>
      <p className="mt-2 text-xs text-slate-400">填入實際交付日期後，影片會列入對應的台北時間月份。</p>
      <div className="mt-3 space-y-2">{pendingDates.map((task) => <div key={task.id} className="flex flex-wrap items-end justify-between gap-2 text-sm">
        <span>{task.title}</span>
        <DeliveryDateForm title={task.title} onSave={(date) => saveDeliveryDate(task.id, date)} />
      </div>)}</div>
    </details>}
    <div className="mt-5"><h3 className="text-sm font-bold">月份紀錄</h3>{batches.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-slate-800 py-6 text-center text-xs text-slate-500">尚未建立月結紀錄</p> : <div className="mt-3 space-y-3">{batches.map((batch) => <article key={batch.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{batch.month} · {batch.items.length} 支</p><p className="mt-1 text-lg font-black text-emerald-400">{money(batch.total)}</p></div><select aria-label={`${batch.month} 收款狀態`} disabled={batch.status === 'paid'} value={batch.status} onChange={(event) => updateSettlementBatch(batch.id, { status: event.target.value as SettlementBatch['status'] })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">{batch.status === 'draft' && <option value="draft">待請款</option>}<option value="invoiced">已請款</option><option value="paid">已收款</option></select></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-slate-400">調整金額<input type="number" key={`${batch.id}-${batch.status}`} disabled={batch.status !== 'draft'} defaultValue={batch.adjustment} onBlur={(event) => updateSettlementBatch(batch.id, { adjustment: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label><label className="text-xs text-slate-400">請款編號<input defaultValue={batch.invoiceNumber ?? ''} onBlur={(event) => updateSettlementBatch(batch.id, { invoiceNumber: event.target.value.trim() || undefined })} placeholder="例如：INV-2026-09" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label><label className="text-xs text-slate-400">請款日<input type="date" value={batch.invoiceDate ?? ''} onChange={(event) => updateSettlementBatch(batch.id, { invoiceDate: event.target.value || undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label><label className="text-xs text-slate-400">付款期限<input type="date" value={batch.dueDate ?? ''} onChange={(event) => updateSettlementBatch(batch.id, { dueDate: event.target.value || undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100" /></label></div><details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">查看交付明細</summary><div className="mt-2 space-y-1">{batch.items.map((item) => <p key={item.taskId} className="flex justify-between gap-3"><span className="truncate">{item.title}</span><span className="shrink-0">{money(item.unitPrice)}</span></p>)}</div></details>{Boolean(batch.includedDeliveries?.length) && <div className="mt-3 text-xs text-emerald-300">
      <p className="font-semibold">補登交付（已含在原批收款）</p>
      <ul className="mt-2 space-y-1">{batch.includedDeliveries?.map((item) => <li key={item.taskId}>{item.title} · {taipeiDeliveryDate(item.deliveredAt)}</li>)}</ul>
    </div>}
    {batch.status !== 'draft' && <p className="mt-3 text-xs text-slate-400">金額與計價明細已鎖定。</p>}
    {batch.status === 'invoiced' && <button type="button" onClick={() => window.confirm('確認在系統退回待請款？原請款金額與編號會保留在更正紀錄。') && withdrawInvoice(batch.id)} className="mt-3 text-xs text-amber-300 hover:text-amber-200">撤回請款以更正</button>}
    {Boolean(batch.withdrawnInvoices?.length) && <details className="mt-3 text-xs text-slate-400">
      <summary className="cursor-pointer">查看請款更正紀錄</summary>
      <ul className="mt-2 space-y-1">{batch.withdrawnInvoices?.map((item, index) => <li key={index}>{taipeiDeliveryDate(item.withdrawnAt)} 退回 · {item.invoiceNumber || '未填編號'} · {money(item.amount)}</li>)}</ul>
    </details>}
    {batch.status === 'draft' && !batch.withdrawnInvoices?.length && <button onClick={() => window.confirm(`撤銷 ${batch.month} 月結並把影片放回看板嗎？`) && reopenSettlementBatch(batch.id)} className="mt-4 text-xs text-rose-400 hover:text-rose-300">撤銷月結</button>}</article>)}</div>}</div>
  </section>;
}
