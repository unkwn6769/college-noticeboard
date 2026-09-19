import Link from "next/link";
import { listAdminNotices } from "@/src/lib/notices";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "badge badge-draft",
  PUBLISHED: "badge badge-published",
  ARCHIVED: "badge badge-archived",
};

export default async function AdminNoticesPage() {
  const notices = await listAdminNotices();

  const published = notices.filter((n) => n.status === "PUBLISHED").length;
  const drafts = notices.filter((n) => n.status === "DRAFT").length;
  const archived = notices.filter((n) => n.status === "ARCHIVED").length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Notices</h1>
          <p className="muted">Create, edit and publish notices. {notices.length} total — {published} published, {drafts} draft, {archived} archived.</p>
        </div>
        <Link className="btn" href="/admin/notices/new">
          + New notice
        </Link>
      </div>

      {notices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h2>No notices yet</h2>
          <p className="muted">Create your first notice to get started.</p>
          <Link className="btn" href="/admin/notices/new">Create notice</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th>Status</th>
                <th>Author</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {n.title}
                      {n.is_pinned && (
                        <span className="badge badge-pinned" style={{ marginLeft: 8 }}>Pinned</span>
                      )}
                    </div>
                    {n.category && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{n.category}</div>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {n.department ? n.department.replace("-noticeboard", "").toUpperCase() : "College-wide"}
                  </td>
                  <td>
                    <span className={STATUS_CLASS[n.status] ?? "badge"}>
                      {STATUS_LABEL[n.status] ?? n.status}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{n.author}</td>
                  <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                    {new Date(n.updated_at).toLocaleDateString()}
                  </td>
                  <td>
                    <Link className="btn secondary" href={`/admin/notices/${n.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
