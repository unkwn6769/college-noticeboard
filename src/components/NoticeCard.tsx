import Link from "next/link";
import { ArrowRight, CalendarDays, Pin } from "lucide-react";
import { departmentLabel, formatDate, truncate } from "@/src/lib/format";

export type NoticeCardData = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  department: string | null;
  is_pinned: boolean;
  published_at: string | null;
};

type Props = {
  notice: NoticeCardData;
  /** Show the first lines of the body; list rows on dense pages turn it off. */
  excerpt?: boolean;
  featured?: boolean;
  /** Overrides the link target, used on the homepage department panels. */
  href?: string;
};

/**
 * One notice row for every public list. Pinned notices are visually
 * distinguished by an "Important" badge and a rule, never by colour alone.
 */
export default function NoticeCard({ notice, excerpt = true, featured, href }: Props) {
  const target = href ?? `/notices/${notice.id}`;
  const department = departmentLabel(notice.department);

  return (
    <article className={`notice-card${featured ? " notice-card-featured" : ""}`}>
      <div className="notice-card-main">
        <div className="notice-card-meta">
          {notice.is_pinned ? (
            <span className="badge badge-warning">
              <Pin aria-hidden="true" />
              Important
            </span>
          ) : null}
          {department ? <span className="badge">{department}</span> : null}
          {notice.category ? <span className="badge">{notice.category}</span> : null}
          <span className="notice-date">
            <CalendarDays aria-hidden="true" />
            <time dateTime={notice.published_at ?? undefined}>
              {formatDate(notice.published_at, { fallback: "Not yet published" })}
            </time>
          </span>
        </div>

        <h3 className="notice-card-title">
          <Link className="notice-card-title-link" href={target}>
            {notice.title}
          </Link>
        </h3>

        {excerpt ? (
          <p className="notice-card-excerpt clamp-3">{truncate(notice.body, 220)}</p>
        ) : null}
      </div>

      <span className="notice-card-cta">
        <Link className="link-arrow" href={target}>
          Read notice
          <ArrowRight aria-hidden="true" />
          <span className="sr-only">: {notice.title}</span>
        </Link>
      </span>
    </article>
  );
}
