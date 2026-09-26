import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  items: Crumb[];
  /** Extra context announced for the final crumb, e.g. its full untruncated name. */
  currentLabel?: string;
  className?: string;
  /**
   * Landmark name. Pages that legitimately show more than one trail (an
   * archive location inside a department page) must pass a distinct value so
   * a screen-reader landmark list still tells the trails apart.
   */
  label?: string;
};

/**
 * The one breadcrumb implementation in the product.
 *
 * Semantics: a labelled `nav` landmark containing an ordered list, so the
 * trail is announced as a hierarchy rather than a row of loose links. Every
 * crumb except the last is a `next/link`; the last is a plain span carrying
 * `aria-current="page"`, which is the only correct use of that attribute in a
 * trail — it identifies one element, so a page must never render two trails
 * that both claim the current page.
 */
export default function Breadcrumbs({
  items,
  currentLabel,
  className,
  label = "Breadcrumb",
}: Props) {
  if (items.length === 0) return null;

  return (
    <nav className={className} aria-label={label}>
      <ol className="breadcrumbs">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="row row-2">
              {index > 0 ? (
                <span className="breadcrumb-sep" aria-hidden="true">
                  <ChevronRight />
                </span>
              ) : null}
              {item.href && !isLast ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} title={item.label}>
                  {item.label}
                  {isLast && currentLabel ? <span className="sr-only">{currentLabel}</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
