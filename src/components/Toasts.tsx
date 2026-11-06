'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/api';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

type ToastFn = (t: Omit<Toast, 'id'>) => void;
const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback<ToastFn>(
    (t) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-fade-in items-start gap-3 rounded-2xl bg-white p-3.5 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10"
          >
            <span className={cx('mt-0.5', t.tone === 'success' ? 'text-emerald-500' : t.tone === 'error' ? 'text-rose-500' : 'text-brand-500')}>
              {t.tone === 'success' ? <CircleCheck className="size-5" /> : t.tone === 'error' ? <CircleAlert className="size-5" /> : <Info className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-2 break-words text-[13px] text-slate-500 dark:text-slate-400">{t.body}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-1.5 text-[13px] font-semibold text-brand-600 hover:underline dark:text-brand-300"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" aria-label="Close" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
