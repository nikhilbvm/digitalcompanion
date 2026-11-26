'use client';

import { useEffect } from 'react';

export interface ToastState {
  id: number;
  message: string;
  tone: 'error' | 'success';
}

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex justify-center sm:top-5"
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto max-w-md rounded-full border px-5 py-3 text-base font-medium shadow-lg backdrop-blur ${
          toast.tone === 'error'
            ? 'border-red-200 bg-red-50/95 text-red-950'
            : 'border-teal-200 bg-white/95 text-teal-950'
        }`}
      >
        {toast.message}
      </div>
    </div>
  );
}
