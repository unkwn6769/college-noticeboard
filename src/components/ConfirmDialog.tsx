"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import Dialog from "@/src/components/Dialog";

export type ConfirmOptions = {
  title: string;
  /** What will be affected, named explicitly. */
  subject?: string;
  /** What happens as a result, in plain language. */
  consequence: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "warning";
  /** When set, the operator must type this exact text to enable confirmation. */
  requireTyped?: string;
};

type Request = ConfirmOptions & {
  resolve: (result: boolean) => void;
};

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const TONE_ICON = {
  default: Info,
  danger: OctagonAlert,
  warning: TriangleAlert,
} as const;

/**
 * Promise-based confirmation, replacing every `window.confirm` in the admin
 * surface.
 *
 * Two properties matter:
 * 1. The dialog names the resource and explains the consequence, so a
 *    permanent purge can never be confused with a reversible quarantine.
 * 2. Irreversible actions can require the operator to type a confirmation
 *    phrase, which structurally prevents double-submission by muscle memory.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = useCallback<ConfirmContextValue>((options) => {
    setTyped("");
    setBusy(false);
    return new Promise<boolean>((resolve) => {
      setRequest({ ...options, resolve });
    });
  }, []);

  const settle = useCallback(
    (result: boolean) => {
      setRequest((current) => {
        current?.resolve(result);
        return null;
      });
      setTyped("");
    },
    [],
  );

  const tone = request?.tone ?? "default";
  const Icon = TONE_ICON[tone];
  const locked = Boolean(request?.requireTyped) && typed.trim() !== request?.requireTyped;

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title={request?.title ?? ""}
        icon={<Icon />}
        description={request?.consequence}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => settle(false)}
            >
              {request?.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              className={`btn${tone === "danger" ? " btn-danger" : ""}`}
              disabled={busy || locked}
              onClick={() => {
                setBusy(true);
                settle(true);
              }}
            >
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {request?.confirmLabel ?? "Confirm"}
            </button>
          </>
        }
      >
        {request?.subject ? (
          <p className="dialog-resource">{request.subject}</p>
        ) : null}
        {request?.requireTyped ? (
          <div className="field">
            <label className="field-label" htmlFor="confirm-typed">
              Type <span className="mono">{request.requireTyped}</span> to confirm
            </label>
            <input
              id="confirm-typed"
              className="input"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              aria-describedby="confirm-typed-hint"
            />
            <p className="field-hint" id="confirm-typed-hint">
              This action cannot be undone.
            </p>
          </div>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used inside a ConfirmProvider");
  }
  return context;
}
