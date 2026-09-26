type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  items: Crumb[];
  /** Current page title; announced to assistive technology only. */
  currentLabel?: string;
  className?: string;
};

/**
 * One breadcrumb implementation for the whole product. The final crumb is
 * marked `aria-current`; intermediate crumbs are links, and the label is
 * repeated in a visually hidden span so it is available to a screen reader
 * even when the visible text is truncated by CSS.
 */
export default function Breadcrumbs({ items, currentLabel, className }: Props) {
  if (items.length === 0) return null;

  return (
    <nav className={`breadcrumbs${className ? ` ${className}` : ""}`} aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="row row-2" style={{ gap: 2 }}>
            {index > 0 ? (
              <span className="breadcrumb-sep" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
            {item.href && !isLast ? (
              <a href={item.href}>
                {item.label}
                <span className="sr-only"> (opens in the same page)</span>
              </a>
            ) : (
              <span aria-current={isLast ? "page" : undefined} title={item.label}>
                {item.label}
                {isLast && currentLabel ? <span className="sr-only">{currentLabel}</span> : null}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
