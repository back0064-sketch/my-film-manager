import Link from 'next/link';

export default function LoginErrorPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8"><h1 className="text-2xl font-bold text-rose-300">Google 登入未完成</h1><p className="mt-4 text-sm text-slate-400">請選擇原本使用這個控制台的 Google 帳號。若仍無法登入，請先使用既有 Email 與密碼；系統會保留原本的專案資料。</p><Link href="/" className="mt-6 inline-block text-indigo-300">回到登入頁</Link></section></main>;
}
