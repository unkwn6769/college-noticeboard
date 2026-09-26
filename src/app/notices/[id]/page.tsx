import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Download,
  Hash,
  Megaphone,
  Pin,
  User,
} from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import CopyButton from "@/src/components/CopyButton";
import PrintButton from "@/src/components/PrintButton";
import FileIcon from "@/src/components/FileIcon";
import EmptyState from "@/src/components/EmptyState";
import SectionHeader from "@/src/components/SectionHeader";
import { getNotice, listPublishedNotices } from "@/src/lib/notices";
import { listNoticeAttachments } from "@/src/lib/notice-attachments";
import { getDepartment } from "@/src/lib/department-registry";
import { assertUuid } from "@/src/lib/security";
import { departmentLabel, fileTypeLabel, formatBytes, formatDateTime } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    assertUuid(id);
  } catch {
    return { title: "Notice not found" };
  }
  const notice = await getNotice(id);
  if (!notice) return { title: "Notice not found" };
  return {
    title: notice.title,
    description: String(notice.body).slice(0, 155),
  };
}

export default async function NoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    assertUuid(id);
  } catch {
    notFound();
  }

  const notice = await getNotice(id);
  if (!notice) notFound();

  const [attachments, related] = await Promise.all([
    listNoticeAttachments(id, { publicOnly: true }),
    notice.department
      ? listPublishedNotices("", 5, { department: notice.department })
      : Promise.resolve([]),
  ]);

  const department = notice.department ? getDepartment(notice.department) : null;
  const departmentName = department?.name ?? departmentLabel(notice.department);
  const relatedNotices = related
    .filter((item) => item.id !== notice.id)
    .slice(0, 4);

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Notices", href: "/#notices" },
              ...(notice.department
                ? [
                    {
                      label: department?.shortName ?? departmentLabel(notice.department) ?? "Department",
                      href: `/departments/${notice.department}`,
                    },
                  ]
                : []),
              { label: notice.title },
            ]}
          />

          <article className="reading">
            <div className="reading-meta">
              {notice.is_pinned ? (
                <span className="badge badge-warning">
                  <Pin aria-hidden="true" />
                  Important
                </span>
              ) : null}
              {notice.department ? (
                <Link className="badge badge-info" href={`/departments/${notice.department}`}>
                  {departmentName}
                </Link>
              ) : (
                <span className="badge badge-info">College-wide</span>
              )}
              {notice.category ? <span className="badge">{notice.category}</span> : null}
              <span className="badge">
                <span className="badge-dot" aria-hidden="true" />
                Published
              </span>
            </div>

            <h1 className="reading-title">{notice.title}</h1>

            <dl className="reading-byline">
              <div className="byline-item">
                <User aria-hidden="true" />
                <dt className="sr-only">Published by</dt>
                <dd>{notice.author}</dd>
              </div>
              <div className="byline-item">
                <CalendarDays aria-hidden="true" />
                <dt className="sr-only">Published on</dt>
                <dd>
                  <time dateTime={notice.published_at ?? undefined}>
                    {formatDateTime(notice.published_at, { fallback: "Not yet published" })}
                  </time>
                </dd>
              </div>
              {notice.department ? (
                <div className="byline-item">
                  <Megaphone aria-hidden="true" />
                  <dt className="sr-only">Department</dt>
                  <dd>
                    <Link
                      className="link-arrow"
                      href={`/departments/${notice.department}`}
                    >
                      {departmentName}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="reading-actions no-print row row-2" style={{ marginTop: "var(--space-4)" }}>
              <Link className="btn btn-ghost btn-sm" href="/#notices">
                <ArrowLeft aria-hidden="true" />
                All notices
              </Link>
              <span className="spacer" />
              <CopyButton label="Copy link" copiedLabel="Link copied" />
              <PrintButton />
            </div>

            <div className="reading-body">{notice.body}</div>

            <section
              className="section"
              aria-labelledby="notice-attachments-title"
              style={{ marginTop: "var(--space-8)" }}
            >
              <SectionHeader
                eyebrow="Documents"
                title={`Attachments (${attachments.length})`}
                id="notice-attachments-title"
                description="Documents published with this notice."
              />
              {attachments.length === 0 ? (
                <EmptyState
                  compact
                  icon={Hash}
                  title="No attachments"
                  description="This notice was published without any supporting documents."
                />
              ) : (
                <ul className="attachment-list" style={{ listStyle: "none", padding: 0 }}>
                  {attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <div className="attachment">
                        <span className="resource-icon" aria-hidden="true">
                          <FileIcon
                            name={attachment.original_name}
                            mimeType={attachment.mime_type}
                          />
                        </span>
                        <span className="attachment-main">
                          <span className="attachment-name" title={attachment.original_name}>
                            {attachment.original_name}
                          </span>
                          <span className="attachment-meta">
                            {fileTypeLabel(attachment.original_name, attachment.mime_type)} ·{" "}
                            {formatBytes(attachment.size_bytes)}
                          </span>
                        </span>
                        <a
                          className="btn btn-secondary btn-sm"
                          href={`/api/notices/${id}/attachments/${attachment.id}`}
                        >
                          <Download aria-hidden="true" />
                          Download
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {relatedNotices.length > 0 ? (
              <section className="section" aria-labelledby="related-notices-title">
                <SectionHeader
                  eyebrow="Related"
                  title="More from this department"
                  id="related-notices-title"
                  action={
                    notice.department ? (
                      <Link className="link-arrow" href={`/departments/${notice.department}`}>
                        Open department
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    ) : null
                  }
                />
                <ul className="related-list" style={{ listStyle: "none", padding: 0 }}>
                  {relatedNotices.map((item) => (
                    <li key={item.id}>
                      <Link className="related-item" href={`/notices/${item.id}`}>
                        <span>
                          <span className="related-title">{item.title}</span>
                          <span className="related-date" style={{ display: "block" }}>
                            {formatDateTime(item.published_at, { fallback: "Unpublished" })}
                          </span>
                        </span>
                        <ArrowRight aria-hidden="true" width={16} height={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
