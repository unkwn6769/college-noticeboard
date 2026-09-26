import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  /** Heading level for pages that nest sections under a page title. */
  as?: "h2" | "h3";
};

/** Section heading used across public and admin pages. */
export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  id,
  as: Heading = "h2",
}: Props) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading className="section-title" id={id}>
          {title}
        </Heading>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {action ? <div className="no-print">{action}</div> : null}
    </div>
  );
}
