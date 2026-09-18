import Link from "next/link";

import PublicFooter from "@/src/components/PublicFooter";
import PublicNav from "@/src/components/PublicNav";
import SectionHeader from "@/src/components/SectionHeader";
import { listDepartmentStats } from "@/src/lib/departments";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const departments = await listDepartmentStats();
  const totalResources = departments.reduce(
    (sum, department) => sum + department.resourceCount,
    0,
  );

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <section className="public-page-heading">
          <p className="public-eyebrow">Archive</p>
          <h1>College archive</h1>
          <p className="lead public-archive-root-note">
            Browse the migrated college archive by department, folder and resource.
            Logical archive paths are used throughout; physical storage locations are never exposed.
          </p>
        </section>

        <section className="public-stats compact-stats" aria-label="Archive statistics">
          <div className="public-stat card-soft">
            <span className="stat-label">Departments</span>
            <span className="stat-value">{departments.length}</span>
          </div>
          <div className="public-stat card-soft">
            <span className="stat-label">Active resources</span>
            <span className="stat-value">{totalResources.toLocaleString("en-IN")}</span>
          </div>
        </section>

        <section className="public-section-block">
          <SectionHeader
            eyebrow="Directory"
            title="Browse by department"
            description="Every registered department remains visible, including departments with zero migrated resources."
          />
          <div className="public-department-grid">
            {departments.map((department) => (
              <Link
                className="public-department-card"
                href={`/archive/${department.slug}`}
                key={department.slug}
              >
                <div className="public-department-card-top">
                  <span className="public-department-code">{department.shortName}</span>
                  <span className="public-department-arrow" aria-hidden="true">↗</span>
                </div>
                <h3>{department.name}</h3>
                <p className="muted">{department.description}</p>
                <div className="public-department-card-bottom">
                  <span>{department.resourceCount.toLocaleString("en-IN")} resources</span>
                  <span>{department.resourceCount === 0 ? "No archive yet" : "Browse archive"}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="public-quick-links">
          <Link className="public-quick-link card-soft" href="/departments">
            <span><span className="public-eyebrow">Directory</span><strong>Department pages</strong></span>
            <span>→</span>
          </Link>
          <Link className="public-quick-link card-soft" href="/search">
            <span><span className="public-eyebrow">Discovery</span><strong>Search the portal</strong></span>
            <span>→</span>
          </Link>
          <Link className="public-quick-link card-soft" href="/">
            <span><span className="public-eyebrow">Home</span><strong>Back to noticeboard</strong></span>
            <span>→</span>
          </Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
