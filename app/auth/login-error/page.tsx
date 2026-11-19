import Link from 'next/link';

export default function LoginErrorPage() {
  return <main className="flex min-h-screen items-center justify-center bg-work-paper p-6 text-work-ink"><section className="auth-card w-full max-w-md p-6 sm:p-8"><h1 className="workspace-heading text-2xl font-semibold text-work-danger">Google 登入未完成</h1><p className="mt-4 text-sm text-work-muted">請選擇原本使用這個控制台的 Google 帳號。若仍無法登入，請先使用既有 Email 與密碼；系統會保留原本的專案資料。</p><Link href="/" className="workspace-button mt-6 inline-block px-2 py-1">回到登入頁</Link></section></main>;
}
