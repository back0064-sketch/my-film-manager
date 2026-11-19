import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return <main className="flex min-h-screen items-center justify-center bg-work-paper p-6 text-work-ink"><section className="auth-card w-full max-w-md p-6 sm:p-8"><h1 className="workspace-heading text-2xl font-semibold text-work-danger">重設連結已失效</h1><p className="mt-3 text-sm text-work-muted">這個連結可能已使用、過期，或被郵件 App 截斷。請回到登入頁重新申請重設連結。</p><Link href="/" className="workspace-button workspace-button--primary mt-6 inline-block px-4 py-3 text-sm font-bold">回到登入頁</Link></section></main>;
}
