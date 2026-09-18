import Link from "next/link";
import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import DepartmentCard from "@/src/components/DepartmentCard";
import SectionHeader from "@/src/components/SectionHeader";
import { listRecentArchiveFiles } from "@/src/lib/archive";
import { listPublishedNotices } from "@/src/lib/notices";
import { listDepartmentStats, type DepartmentStats } from "@/src/lib/departments";
import { getMeaningfulLegacyPath } from "@/src/lib/file-search";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getDepartmentName(
  department: string | null,
  departments: DepartmentStats[],
) {
  if (!department) return null;
  return departments.find((item) => item.slug === department)?.name ?? department;
}


export default async function HomePage() {
  const [notices, examinationNotices, generalNotices, departments, recentResources] =
    await Promise.all([
      listPublishedNotices("", 6),
      listPublishedNotices("", 4, { department: "exams-noticeboard" }),
      listPublishedNotices("", 4, { department: "gen-noticeboard" }),
      listDepartmentStats(),
      listRecentArchiveFiles(8),
    ]);

  const totalResources = departments.reduce((sum, department) => sum + department.resourceCount, 0);
  const latestResource = departments.reduce<string | null>((latest, department) => {
    if (!department.latestUpdate) return latest;
    if (!latest) return department.latestUpdate;
    return new Date(department.latestUpdate) > new Date(latest) ? department.latestUpdate : latest;
  }, null);

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <section className="public-hero">
          <div className="public-online-pill"><span className="public-online-dot" /> Noticeboard online</div>
          <h1>College Notice Portal<br /><span>Official announcements.</span></h1>
          <p className="lead public-hero-copy">Access official college notices, examination updates and departmental resources from one self-hosted noticeboard.</p>
          <form className="public-hero-search" action="/search" method="get">
            <input
              name="q"
              aria-label="Search the noticeboard"
              placeholder="Search notices, departments and resources..."
            />
            <button className="btn" type="submit">Search</button>
          </form>
        </section>

        <section className="public-stats" aria-label="Portal statistics">
          <div className="public-stat card-soft"><span className="stat-label">Departments</span><span className="stat-value">{departments.length}</span></div>
          <div className="public-stat card-soft"><span className="stat-label">Archive resources</span><span className="stat-value">{totalResources.toLocaleString("en-IN")}</span></div>
          <div className="public-stat card-soft"><span className="stat-label">Latest archive update</span><span className="stat-value stat-value-small">{formatDate(latestResource)}</span></div>
        </section>

        <section className="public-section-block" id="notices">
          <SectionHeader
            eyebrow="Updates"
            title="Latest & important notices"
            description="Published official notices, with important items shown first."
          />
          {notices.length === 0 ? (
            <div className="empty-state card">
              <h2>No published notices yet</h2>
              <p className="muted">Published notices will appear here.</p>
            </div>
          ) : (
            <div className="public-notice-list">
              {notices.map((notice) => (
                <article className="public-notice-row card" key={notice.id}>
                  <div>
                    <p className="public-eyebrow">{formatDate(notice.published_at)}</p>
                    <h3><Link href={`/notices/${notice.id}`}>{notice.title}</Link></h3>
                    <p className="muted public-notice-excerpt">{String(notice.body).slice(0, 220)}{String(notice.body).length > 220 ? "…" : ""}</p>
                  </div>
                  <Link className="public-text-link" href={`/notices/${notice.id}`}>Read notice →</Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="public-section-block">
          <div className="public-feature-grid">
            <article className="public-feature-panel card">
              <div className="public-feature-panel-heading">
                <div>
                  <p className="public-eyebrow">Academic</p>
                  <h2>Examinations</h2>
                  <p className="muted">
                    Examination notices published by the examinations unit.
                  </p>
                </div>
                <a className="public-text-link" href="/departments/exams-noticeboard">
                  Open department →
                </a>
              </div>
              {examinationNotices.length === 0 ? (
                <div className="empty-state card-soft">
                  <h3>No examination notices yet</h3>
                  <p className="muted">
                    Published examination updates will appear here.
                  </p>
                </div>
              ) : (
                <div className="public-notice-list">
                  {examinationNotices.map((notice) => (
                    <article className="public-notice-row card-soft" key={notice.id}>
                      <div>
                        <div className="public-notice-detail-meta">
                          {notice.is_pinned ? <span className="public-tag">Important</span> : null}
                          {notice.category ? <span className="public-tag">{notice.category}</span> : null}
                          <span className="public-notice-date">{formatDate(notice.published_at)}</span>
                        </div>
                        <h3><Link href={`/notices/${notice.id}`}>{notice.title}</Link></h3>
                      </div>
                      <Link className="public-text-link" href={`/notices/${notice.id}`}>Read →</Link>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="public-feature-panel card">
              <div className="public-feature-panel-heading">
                <div>
                  <p className="public-eyebrow">College-wide</p>
                  <h2>General notices</h2>
                  <p className="muted">
                    General notices intended for the wider college community.
                  </p>
                </div>
                <a className="public-text-link" href="/departments/gen-noticeboard">
                  Open department →
                </a>
              </div>
              {generalNotices.length === 0 ? (
                <div className="empty-state card-soft">
                  <h3>No general notices yet</h3>
                  <p className="muted">
                    Published general updates will appear here.
                  </p>
                </div>
              ) : (
                <div className="public-notice-list">
                  {generalNotices.map((notice) => (
                    <article className="public-notice-row card-soft" key={notice.id}>
                      <div>
                        <div className="public-notice-detail-meta">
                          {notice.is_pinned ? <span className="public-tag">Important</span> : null}
                          {notice.category ? <span className="public-tag">{notice.category}</span> : null}
                          <span className="public-notice-date">{formatDate(notice.published_at)}</span>
                        </div>
                        <h3><Link href={`/notices/${notice.id}`}>{notice.title}</Link></h3>
                      </div>
                      <Link className="public-text-link" href={`/notices/${notice.id}`}>Read →</Link>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        </section>

        <section className="public-section-block" id="departments">
          <SectionHeader eyebrow="Directory" title="Departments" description="Choose a department to explore its archive." />
          <div className="public-department-grid">
            {departments.map((department) => <DepartmentCard key={department.slug} department={department} />)}
          </div>
        </section>

        <section className="public-section-block">
          <SectionHeader
            eyebrow="Archive"
            title="Recently added resources"
            description="The latest resources added to the active legacy archive."
          />

          {recentResources.length === 0 ? (
            <div className="empty-state card">
              <h3>No archive resources available</h3>
              <p className="muted">
                The active archive does not contain any resources yet.
              </p>
            </div>
          ) : (
            <div className="public-resource-list">
              {recentResources.map((resource) => {
                const departmentName = resource.legacy_department
                  ? getDepartmentName(resource.legacy_department, departments)
                  : null;
                const visiblePath = getMeaningfulLegacyPath(
                  resource.legacy_relative_path,
                  resource.legacy_department,
                );
                const href = resource.legacy_department
                  ? `/departments/${resource.legacy_department}/file/${resource.id}`
                  : "/departments";

                return (
                  <Link className="public-resource-row card-soft" href={href} key={resource.id}>
                    <span className="public-resource-row-main">
                      <strong className="public-resource-title">{resource.original_name}</strong>
                      <span className="public-resource-path">
                        {visiblePath || resource.original_name}
                      </span>
                      <span className="public-resource-meta">
                        {departmentName || "Archive"} · Added {formatDate(resource.created_at)}
                      </span>
                    </span>
                    <span className="public-resource-size">{formatBytes(resource.size_bytes)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="public-quick-links">
          <Link className="public-quick-link card-soft" href="/departments"><span><span className="public-eyebrow">Browse</span><strong>All departments</strong></span><span>→</span></Link>
          <Link className="public-quick-link card-soft" href="/departments/exams-noticeboard"><span><span className="public-eyebrow">Academic</span><strong>Examinations</strong></span><span>→</span></Link>
          <Link className="public-quick-link card-soft" href="/search"><span><span className="public-eyebrow">Discovery</span><strong>Search the portal</strong></span><span>→</span></Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
