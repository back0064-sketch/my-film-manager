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
  const tone = message.tone === 'success' ? 'border-work-positive-line text-work-positive' : message.tone === 'error' ? 'border-work-danger-line text-work-danger' : 'border-work-rule text-work-link';
  return <div role={message.tone === 'error' ? 'alert' : 'status'} className={`fixed bottom-5 left-4 right-4 z-50 flex items-start justify-between gap-4 rounded-xl border bg-work-surface px-4 py-3 text-sm shadow-2xl sm:left-auto sm:right-6 sm:max-w-md ${tone}`}><span>{message.text}</span><button onClick={onDismiss} aria-label="關閉通知" className="workspace-button shrink-0 px-2 py-1">×</button></div>;
}
