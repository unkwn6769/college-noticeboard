import Link from "next/link";
import { ArrowRight, Building2, FileStack, Search } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import DepartmentCard from "@/src/components/DepartmentCard";
import PageHeader from "@/src/components/PageHeader";
import SectionHeader from "@/src/components/SectionHeader";
import EmptyState from "@/src/components/EmptyState";
import { listDepartmentStats } from "@/src/lib/departments";
import { formatCount } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "College archive",
  description:
    "Browse the migrated college archive by department, folder and resource. Logical archive paths only.",
};

export default async function ArchivePage() {
  const departments = await listDepartmentStats();
  const totalResources = departments.reduce(
    (sum, department) => sum + department.resourceCount,
    0,
  );
  const populated = departments.filter((department) => department.resourceCount > 0);

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <PageHeader
            eyebrow="Archive"
            title="College archive"
            description="Browse the migrated college archive by department, folder and resource. Logical archive paths are used throughout; physical storage locations are never exposed."
            actions={
              <>
                <Link className="btn btn-secondary" href="/departments">
                  <Building2 aria-hidden="true" />
                  Department pages
                </Link>
                <Link className="btn btn-secondary" href="/search">
                  <Search aria-hidden="true" />
                  Search resources
                </Link>
              </>
            }
            meta={
              <>
                <span className="badge">
                  <Building2 aria-hidden="true" />
                  {departments.length} departments
                </span>
                <span className="badge">
                  <FileStack aria-hidden="true" />
                  {formatCount(totalResources)} active resources
                </span>
                <span className="badge">{populated.length} with content</span>
              </>
            }
          />

          <section className="section" aria-labelledby="archive-directory">
            <SectionHeader
              eyebrow="Directory"
              title="Browse by department"
              id="archive-directory"
              description="Every registered department remains listed, including departments with zero migrated resources."
            />
            {departments.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No departments registered"
                description="The department registry is empty, so there is nothing to browse yet."
              />
            ) : (
              <div className="department-grid">
                {departments.map((department) => (
                  <DepartmentCard
                    key={department.slug}
                    department={department}
                    hrefBase="/archive"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="archive-next">
            <SectionHeader
              eyebrow="Next"
              title="Other ways in"
              id="archive-next"
            />
            <div className="quick-access">
              <Link className="quick-access-item" href="/departments">
                <span className="quick-access-icon" aria-hidden="true">
                  <Building2 />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">Department pages</span>
                  <span className="quick-access-hint">
                    Notices and archive together, with department context
                  </span>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="quick-access-item" href="/search">
                <span className="quick-access-icon" aria-hidden="true">
                  <Search />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">Search the portal</span>
                  <span className="quick-access-hint">
                    Find a specific file by name or legacy path
                  </span>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
