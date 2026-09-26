"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Info, TriangleAlert, X, OctagonAlert } from "lucide-react";

export type ToastTone = "success" | "danger" | "warning" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  text?: string;
  /** Milliseconds; `0` keeps the toast until it is dismissed. */
  duration: number;
  action?: { label: string; onClick: () => void };
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  text?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
  promise: <T>(
    run: () => Promise<T>,
    messages: { success: string; error?: string },
  ) => Promise<T | undefined>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON = {
  success: CheckCircle2,
  danger: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
} as const;

const TONE_ANNOUNCE = {
  success: "Success",
  danger: "Error",
  warning: "Warning",
  info: "Information",
} as const;

/**
 * Standardised, accessible notifications for the authenticated surface.
 *
 * - Rendered in a polite live region so results are announced once.
 * - Errors are never transient by default: a failed action stays until the
 *   operator dismisses it or retries.
 * - Dismissible, keyboard-reachable, and safe under `prefers-reduced-motion`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const toast = useCallback(
    ({ tone = "info", title, text, duration, action }: ToastInput) => {
      const id = nextId.current++;
      const resolvedDuration = duration ?? (tone === "danger" ? 0 : 5000);
      setToasts((current) => [...current.slice(-3), { id, tone, title, text, duration: resolvedDuration, action }]);
      if (resolvedDuration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), resolvedDuration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const promise = useCallback(
    async <T,>(run: () => Promise<T>, messages: { success: string; error?: string }) => {
      try {
        const result = await run();
        toast({ tone: "success", title: messages.success });
        return result;
      } catch (error) {
        toast({
          tone: "danger",
          title: messages.error ?? "The action could not be completed",
          text: error instanceof Error ? error.message : undefined,
        });
        return undefined;
      }
    },
    [toast],
  );

  const value = useMemo(() => ({ toast, dismiss, promise }), [toast, dismiss, promise]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((item) => {
          const Icon = TONE_ICON[item.tone];
          return (
            <div key={item.id} className={`toast toast-${item.tone}`}>
              <Icon aria-hidden="true" />
              <div className="toast-body">
                <p className="toast-title">
                  <span className="sr-only">{TONE_ANNOUNCE[item.tone]}: </span>
                  {item.title}
                </p>
                {item.text ? <p className="toast-text">{item.text}</p> : null}
                {item.action ? (
                  <button
                    type="button"
                    className="link-arrow"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="dialog-close"
                onClick={() => dismiss(item.id)}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Dismiss notification</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}

/** Convenience: a neutral "working…" toast that the caller dismisses. */
export function useProgressToast() {
  const { toast, dismiss } = useToast();
  return useCallback(
    (title: string) => {
      const id = toast({ tone: "info", title, duration: 0 });
      return () => dismiss(id);
    },
    [toast, dismiss],
  );
}
