import Link from "next/link";
import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import DepartmentCard from "@/src/components/DepartmentCard";
import SectionHeader from "@/src/components/SectionHeader";
import { listPublishedNotices } from "@/src/lib/notices";
import { listDepartmentStats } from "@/src/lib/departments";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const [notices, departments] = await Promise.all([
    listPublishedNotices(query, query ? 12 : 6),
    listDepartmentStats(),
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
          <div className="public-online-pill"><span className="public-online-dot" /> Notice board online</div>
          <h1>Everything important,<br /><span>in one place.</span></h1>
          <p className="lead public-hero-copy">Access official college notices, examination updates and departmental resources from one self-hosted noticeboard.</p>
          <form className="public-hero-search" action="/search" method="get">
            <input
              name="q"
              defaultValue={query}
              aria-label="Search the noticeboard"
              placeholder="Search notices, departments, resources..."
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
          <SectionHeader eyebrow={query ? "Search results" : "Latest"} title={query ? `Notices matching “${query}”` : "Latest notices"} description="Published official notices are shown here." />
          {notices.length === 0 ? (
            <div className="empty-state card"><h2>No notices found</h2><p className="muted">Try a different search term.</p></div>
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

        <section className="public-section-block" id="departments">
          <SectionHeader eyebrow="Directory" title="Departments" description="Choose a department to explore its archive." />
          <div className="public-department-grid">
            {departments.map((department) => <DepartmentCard key={department.slug} department={department} />)}
          </div>
        </section>

        <section className="public-quick-links">
          <Link className="public-quick-link card-soft" href="/departments"><span><span className="public-eyebrow">Browse</span><strong>All departments</strong></span><span>→</span></Link>
          <Link className="public-quick-link card-soft" href="/departments/exams-noticeboard"><span><span className="public-eyebrow">Academic</span><strong>Examinations</strong></span><span>→</span></Link>
          <Link className="public-quick-link card-soft" href="/login"><span><span className="public-eyebrow">Administration</span><strong>Admin portal</strong></span><span>→</span></Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
