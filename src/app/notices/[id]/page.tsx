import Link from "next/link";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import { getNotice } from "@/src/lib/notices";
import { listNoticeAttachments } from "@/src/lib/notice-attachments";
import { assertUuid } from "@/src/lib/security";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function labelDepartment(value: string | null | undefined) {
  return value?.replace("-noticeboard", "") ?? null;
}

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return `${value} B`;

  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
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

  const attachments = await listNoticeAttachments(id, { publicOnly: true });
  const department = labelDepartment(notice.department);

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <Link className="public-back-link" href="/#notices">
          ← Latest notices
        </Link>

        <article className="card public-notice-detail">
          <div className="public-notice-detail-meta">
            {notice.is_pinned && <span className="public-tag">Important</span>}
            {department && <span className="public-tag">{department}</span>}
            {notice.category && <span className="public-tag">{notice.category}</span>}
            <span className="public-notice-date">
              {notice.author} · {new Date(notice.published_at).toLocaleString()}
            </span>
          </div>

          <h1>{notice.title}</h1>
          <div className="notice-body">{notice.body}</div>

          {attachments.length > 0 && (
            <section className="public-notice-attachments" aria-labelledby="notice-attachments-title">
              <div className="public-notice-attachments-header">
                <div>
                  <h2 id="notice-attachments-title">Attachments</h2>
                  <p className="muted">Documents attached to this published notice.</p>
                </div>
              </div>

              <div className="public-notice-attachment-list">
                {attachments.map((attachment) => (
                  <div className="public-notice-attachment" key={attachment.id}>
                    <div>
                      <div className="public-notice-attachment-name">
                        {attachment.original_name}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {attachment.mime_type} · {formatBytes(attachment.size_bytes)}
                      </div>
                    </div>

                    <a
                      className="btn secondary"
                      href={`/api/notices/${id}/attachments/${attachment.id}`}
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>
      <PublicFooter />
    </>
  );
}
