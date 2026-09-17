/* eslint-disable @next/next/no-img-element -- TOTP QR codes are runtime SVG/data URLs. */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { projectApi } from '@/lib/client/project-api';

type Factor = { id: string; type: string; friendlyName?: string; status: string };

function qrSource(value?: string) {
  if (!value) return undefined;
  return value.trim().startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}` : value;
}

export function MfaPanel() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [nextLevel, setNextLevel] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode?: string; secret?: string; uri?: string } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  const load = async () => {
    try {
      const result = await projectApi.mfaStatus();
      setFactors(result.factors);
      setNextLevel(result.nextLevel);
    } catch { /* Security panel should not block the main workspace. */ }
  };

  useEffect(() => {
    let cancelled = false;
    void projectApi.mfaStatus().then((result) => {
      if (cancelled) return;
      setFactors(result.factors);
      setNextLevel(result.nextLevel);
    }).catch(() => { /* Security panel should not block the main workspace. */ });
    return () => { cancelled = true; };
  }, []);
  const verifiedFactors = useMemo(() => factors.filter((factor) => factor.status === 'verified'), [factors]);

  const enroll = async () => {
    setPending(true); setMessage('');
    try {
      const result = await projectApi.mfaEnroll('影視製片控制台');
      setEnrollment(result); setCode(''); setMessage('請用驗證器 App 掃描 QR Code，再輸入 6 位數代碼完成啟用。');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'MFA 啟用失敗'); }
    finally { setPending(false); }
  };

  const verify = async () => {
    if (!enrollment) return;
    setPending(true); setMessage('');
    try {
      await projectApi.mfaVerify(enrollment.factorId, code);
      setEnrollment(null); setCode(''); setMessage('MFA 已啟用；下次登入會要求驗證器代碼。');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : '代碼驗證失敗'); }
    finally { setPending(false); }
  };

  const unenroll = async (factorId: string) => {
    if (!window.confirm('確定要移除此驗證器嗎？移除後登入不再要求 MFA。')) return;
    setPending(true); setMessage('');
    try { await projectApi.mfaUnenroll(factorId); setMessage('驗證器已移除。'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'MFA 移除失敗'); }
    finally { setPending(false); }
  };

  return <section aria-label="帳號安全與 MFA" className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">帳號安全</h2><p className="mt-1 text-xs text-slate-500">使用驗證器 App 增加第二層登入保護。</p></div>{verifiedFactors.length === 0 && !enrollment && <button type="button" disabled={pending} onClick={() => void enroll()} className="rounded-xl border border-indigo-800 px-4 py-2.5 text-sm font-bold text-indigo-300 hover:bg-indigo-950/50 disabled:opacity-60">啟用 MFA</button>}</div>{verifiedFactors.length > 0 && <div className="mt-4 space-y-2">{verifiedFactors.map((factor) => <div key={factor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-3 py-2 text-sm"><span className="text-emerald-300">✓ {factor.friendlyName || '驗證器'} 已啟用</span><button type="button" disabled={pending} onClick={() => void unenroll(factor.id)} className="text-xs text-rose-300 hover:text-rose-200 disabled:opacity-60">移除</button></div>)}</div>}{enrollment && <div className="mt-4 rounded-xl border border-indigo-900/70 bg-slate-950/60 p-4"><p className="text-sm font-semibold">設定驗證器</p>{enrollment.qrCode && <img src={qrSource(enrollment.qrCode)} alt="MFA QR Code" className="mx-auto mt-4 h-44 w-44 rounded bg-white p-2" />}{enrollment.secret && <p className="mt-3 break-all text-center text-xs text-slate-400">無法掃描時輸入密鑰：<code className="text-slate-200">{enrollment.secret}</code></p>}{enrollment.uri && <details className="mt-2 text-center text-xs text-slate-500"><summary className="cursor-pointer">顯示設定 URI</summary><code className="mt-2 block break-all text-left text-[10px] text-slate-400">{enrollment.uri}</code></details>}<div className="mt-4 flex gap-2"><input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位數代碼" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" /><button type="button" disabled={pending || code.length !== 6} onClick={() => void verify()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold disabled:opacity-50">驗證啟用</button></div></div>}{message && <p className="mt-3 text-xs text-amber-300">{message}</p>}{nextLevel === 'aal2' && verifiedFactors.length > 0 && <p className="mt-2 text-xs text-emerald-400">目前工作階段已完成第二層驗證。</p>}</section>;
}
