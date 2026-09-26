import type { ReactNode } from "react";

type IconProps = { className?: string };

type Props = {
  title: string;
  /** What happened, in one sentence. */
  description: ReactNode;
  icon?: React.ComponentType<IconProps>;
  tone?: "neutral" | "danger" | "info";
  actions?: ReactNode;
  compact?: boolean;
  /** `status` for a benign absence, `alert` when something failed. */
  role?: "status" | "alert";
};

/**
 * Every "there is nothing here" and "that did not work" surface in the
 * product. Each instance must answer three questions: what happened, what it
 * means, and what the user can do next.
 */
export default function EmptyState({
  title,
  description,
  icon: Icon,
  tone = "neutral",
  actions,
  compact = false,
  role = "status",
}: Props) {
  return (
    <div
      className={`state${compact ? " state-compact" : ""}`}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
    >
      {Icon ? (
        <span
          className={`state-icon${tone === "danger" ? " state-icon-danger" : tone === "info" ? " state-icon-info" : ""}`}
          aria-hidden="true"
        >
          <Icon />
        </span>
      ) : null}
      <p className="state-title">{title}</p>
      <p className="state-text">{description}</p>
      {actions ? <div className="state-actions">{actions}</div> : null}
    </div>
  );
}
