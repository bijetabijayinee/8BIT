import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

type ToastListener = (toast: ToastMessage) => void;

let nextToastId = 1;
const listeners = new Set<ToastListener>();

export function showToast(kind: ToastKind, title: string, detail?: string) {
  const toast: ToastMessage = { id: nextToastId++, kind, title, detail };
  listeners.forEach((listener) => listener(toast));
}

const toastStyles: Record<ToastKind, { box: string; icon: ReactNode }> = {
  error: {
    box: 'border-rose-200 bg-rose-50 text-rose-900',
    icon: <AlertTriangle size={17} className="text-rose-600" aria-hidden="true" />,
  },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 size={17} className="text-emerald-600" aria-hidden="true" />,
  },
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-900',
    icon: <Info size={17} className="text-sky-600" aria-hidden="true" />,
  },
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener: ToastListener = (toast) => {
      setToasts((current) => [...current.slice(-3), toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 6000);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`animate-toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border p-3 shadow-2xl ${toastStyles[toast.kind].box}`}
        >
          <span className="mt-0.5 shrink-0">{toastStyles[toast.kind].icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.detail ? <p className="mt-0.5 break-words text-xs leading-5 opacity-80">{toast.detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            className="shrink-0 rounded p-1 opacity-60 transition hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
