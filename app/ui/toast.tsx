'use client';

import { useCallback, useEffect, useState } from 'react';

export type ToastMessage = { id: number; text: string; tone: 'success' | 'error' | 'info' };

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return { toast, showToast, dismissToast: () => setToast(null) };
}

export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  if (!message) return null;
  const tone = message.tone === 'success' ? 'border-emerald-700 text-emerald-100' : message.tone === 'error' ? 'border-rose-700 text-rose-100' : 'border-indigo-700 text-indigo-100';
  return <div role={message.tone === 'error' ? 'alert' : 'status'} className={`fixed bottom-5 left-4 right-4 z-50 flex items-start justify-between gap-4 rounded-xl border bg-slate-900 px-4 py-3 text-sm shadow-2xl sm:left-auto sm:right-6 sm:max-w-md ${tone}`}><span>{message.text}</span><button onClick={onDismiss} aria-label="關閉通知" className="shrink-0 text-slate-400 hover:text-white">×</button></div>;
}
