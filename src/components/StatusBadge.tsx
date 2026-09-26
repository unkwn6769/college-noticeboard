import type { StatusDescriptor } from "@/src/lib/status";

type Props = {
  descriptor: StatusDescriptor;
  /** Renders a leading dot so state is not signalled by colour alone. */
  dot?: boolean;
  title?: string;
  className?: string;
};

/**
 * The only badge component in the product. Every lifecycle value on every
 * page goes through here, which is what keeps "Published" looking identical
 * on the dashboard, the notice list, the recycle bin and the audit log.
 */
export default function StatusBadge({ descriptor, dot = false, title, className }: Props) {
  return (
    <span
      className={`badge badge-${descriptor.tone}${className ? ` ${className}` : ""}`}
      title={title ?? descriptor.hint}
    >
      {dot ? <span className="badge-dot" aria-hidden="true" /> : null}
      {descriptor.label}
    </span>
  );
}
