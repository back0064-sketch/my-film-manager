import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-rose-900/70 bg-slate-900 p-8 shadow-xl"><h1 className="text-2xl font-black text-rose-300">重設連結已失效</h1><p className="mt-3 text-sm text-slate-400">這個連結可能已使用、過期，或被郵件 App 截斷。請回到登入頁重新申請重設連結。</p><Link href="/" className="mt-6 inline-block rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold">回到登入頁</Link></section></main>;
}
