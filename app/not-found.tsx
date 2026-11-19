import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-work-paper p-6">
      <section className="auth-card w-full max-w-md p-6 sm:p-8">
        <h1 className="workspace-heading text-2xl font-semibold">找不到頁面</h1>
        <Link href="/" className="workspace-button workspace-button--primary mt-5 inline-flex px-4 py-2 text-sm font-semibold">
          返回工作台
        </Link>
      </section>
    </main>
  );
}
