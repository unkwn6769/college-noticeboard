import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  breadcrumbs?: ReactNode;
  size?: "default" | "small";
  id?: string;
};

/**
 * Standard page header. Every route renders its title, purpose, location and
 * primary actions through this one component so the top of every page lines
 * up identically.
 */
export default function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  breadcrumbs,
  size = "default",
  id,
}: Props) {
  return (
    <>
      {breadcrumbs}
      <div className="page-header">
        <div className="page-header-text">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1
            className={`page-title${size === "small" ? " page-title-sm" : ""}`}
            id={id}
          >
            {title}
          </h1>
          {description ? <p className="page-description">{description}</p> : null}
          {meta ? <div className="page-meta-row">{meta}</div> : null}
        </div>
        {actions ? <div className="page-actions no-print">{actions}</div> : null}
      </div>
    </>
  );
}
