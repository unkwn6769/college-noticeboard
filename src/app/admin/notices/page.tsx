import Link from "next/link";
import { Megaphone, Plus, Pin } from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { listAdminNotices } from "@/src/lib/notices";
import { noticeStatus } from "@/src/lib/status";
import { departmentLabel, formatDate, formatDateTime } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notices",
  robots: { index: false, follow: false },
};

export default async function AdminNoticesPage() {
  const notices = await listAdminNotices();

  const published = notices.filter((notice) => notice.status === "PUBLISHED").length;
  const drafts = notices.filter((notice) => notice.status === "DRAFT").length;
  const archived = notices.filter((notice) => notice.status === "ARCHIVED").length;
  const pinned = notices.filter((notice) => notice.is_pinned).length;

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Notices" }]} />}
        eyebrow="Content"
        title="Notices"
        description="Create, edit, publish and archive college notices. Only published notices are visible to the public."
        actions={
          <Link className="btn" href="/admin/notices/new">
            <Plus aria-hidden="true" />
            New notice
          </Link>
        }
        meta={
          <>
            <span className="badge badge-success">
              {published} published
            </span>
            <span className="badge">{drafts} draft</span>
            <span className="badge badge-warning">{archived} archived</span>
            {pinned > 0 ? (
              <span className="badge">
                <Pin aria-hidden="true" />
                {pinned} pinned
              </span>
            ) : null}
          </>
        }
      />

      {notices.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No notices yet"
          description="The noticeboard has no notices at all. Create a draft to get started — drafts stay private until you publish them."
          actions={
            <Link className="btn" href="/admin/notices/new">
              <Plus aria-hidden="true" />
              Create the first notice
            </Link>
          }
        />
      ) : (
        <>
          <div className="table-wrap show-desktop" tabIndex={0} role="region" aria-label="Notices table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  <th scope="col">Author</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {notices.map((notice) => (
                  <tr key={notice.id}>
                    <td>
                      <div className="cell-primary">{notice.title}</div>
                      {notice.category ? (
                        <div className="cell-sub">{notice.category}</div>
                      ) : null}
                      {notice.is_pinned ? (
                        <div style={{ marginTop: 4 }}>
                          <span className="badge badge-warning">
                            <Pin aria-hidden="true" />
                            Pinned
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                      {departmentLabel(notice.department) ?? "College-wide"}
                    </td>
                    <td>
                      <StatusBadge descriptor={noticeStatus(notice.status)} dot />
                    </td>
                    <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                      {notice.author}
                    </td>
                    <td className="muted nowrap" style={{ fontSize: "var(--text-2xs)" }}>
                      {formatDate(notice.updated_at)}
                    </td>
                    <td className="actions-cell">
                      <Link className="btn btn-secondary btn-sm" href={`/admin/notices/${notice.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="data-list show-mobile" style={{ listStyle: "none", padding: 0 }}>
            {notices.map((notice) => (
              <li className="data-list-item" key={notice.id}>
                <div className="data-list-head">
                  <div style={{ minWidth: 0 }}>
                    <p className="data-list-title">{notice.title}</p>
                    <p className="cell-sub">{notice.category ?? "No category"}</p>
                  </div>
                  <StatusBadge descriptor={noticeStatus(notice.status)} dot />
                </div>
                <dl className="data-list-meta">
                  <div>
                    <dt>Department</dt>
                    <dd>{departmentLabel(notice.department) ?? "College-wide"}</dd>
                  </div>
                  <div>
                    <dt>Author</dt>
                    <dd>{notice.author}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDateTime(notice.updated_at)}</dd>
                  </div>
                </dl>
                <div className="data-list-actions">
                  <Link className="btn btn-secondary btn-sm" href={`/admin/notices/${notice.id}`}>
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
