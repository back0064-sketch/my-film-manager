'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabaseClient } from '@/lib/client/supabase';

export default function PasswordResetPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('正在驗證重設連結…');
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session) setMessage('重設連結已失效或已過期，請重新申請。');
      else { setReady(true); setMessage('請設定新的登入密碼。'); }
    });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    if (password.length < 8) { setMessage('密碼至少需要 8 個字元。'); return; }
    if (password !== confirmation) { setMessage('兩次輸入的密碼不一致。'); return; }
    setPending(true); setMessage('');
    const { error } = await getBrowserSupabaseClient().auth.updateUser({ password });
    setPending(false);
    if (error) { setMessage('密碼更新失敗，請重新申請重設連結。'); return; }
    setComplete(true); setReady(false); setMessage('密碼已更新，請回到登入頁使用新密碼登入。');
    await getBrowserSupabaseClient().auth.signOut();
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl"><h1 className="text-2xl font-black text-indigo-400">重設登入密碼</h1><p className="mt-3 text-sm text-slate-400">{message}</p>{ready && !complete && <div className="mt-6 space-y-4"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="新密碼（至少 8 個字元）" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" /><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="再次輸入新密碼" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" /><button type="button" disabled={pending} onClick={() => void submit()} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:opacity-60">{pending ? '更新中…' : '更新密碼'}</button></div>}<Link href="/" className="mt-6 inline-block text-sm text-indigo-400 hover:text-indigo-300">← 回到登入頁</Link></section></main>;
}
