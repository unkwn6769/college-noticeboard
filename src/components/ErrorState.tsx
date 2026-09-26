import { AlertTriangle, RotateCcw } from "lucide-react";
import EmptyState from "@/src/components/EmptyState";

type Props = {
  title: string;
  /** Safe, user-facing explanation. Never a driver or parser message. */
  message?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  actions?: React.ReactNode;
  compact?: boolean;
};

/**
 * Recovery-oriented error surface: an explanation and a way forward, never a
 * dead end and never an internal error string.
 */
export default function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  actions,
  compact = false,
}: Props) {
  return (
    <EmptyState
      title={title}
      tone="danger"
      role="alert"
      compact={compact}
      icon={AlertTriangle}
      description={
        message?.trim()
          ? message
          : "The request could not be completed. Nothing was changed."
      }
      actions={
        <>
          {onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              {retryLabel}
            </button>
          ) : null}
          {actions}
        </>
      }
    />
  );
}
