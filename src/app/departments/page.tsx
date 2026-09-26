import Link from "next/link";
import { Building2, FileStack, Megaphone, Search } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import DepartmentCard from "@/src/components/DepartmentCard";
import PageHeader from "@/src/components/PageHeader";
import SectionHeader from "@/src/components/SectionHeader";
import EmptyState from "@/src/components/EmptyState";
import { listDepartmentStats } from "@/src/lib/departments";
import { formatCount } from "@/src/lib/format";
import { matchesText } from "@/src/lib/ui-text";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  return {
    title: query ? `Departments matching “${query}”` : "Departments",
    description:
      "Every college department, its description and the size of its migrated archive.",
    robots: query ? { index: false, follow: true } : undefined,
  };
}

export default async function DepartmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const departments = await listDepartmentStats();

  const visible = query
    ? departments.filter((department) =>
        matchesText(
          [department.name, department.shortName, department.description],
          query,
        ),
      )
    : departments;

  const totalResources = departments.reduce(
    (sum, department) => sum + department.resourceCount,
    0,
  );
  const withArchive = departments.filter((department) => department.resourceCount > 0).length;

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <PageHeader
            eyebrow="Directory"
            title="Departments"
            description="Every registered college department, with the size of its migrated archive. Departments with no resources yet remain listed."
            meta={
              <>
                <span className="badge">
                  <Building2 aria-hidden="true" />
                  {departments.length} departments
                </span>
                <span className="badge">
                  <FileStack aria-hidden="true" />
                  {formatCount(totalResources)} resources
                </span>
                <span className="badge">{withArchive} with an archive</span>
              </>
            }
          />

          <form className="toolbar no-print" action="/departments" method="get" role="search">
            <div className="search-field toolbar-search">
              <Search aria-hidden="true" />
              <label className="sr-only" htmlFor="department-filter">
                Filter departments by name
              </label>
              <input
                id="department-filter"
                className="input"
                type="search"
                name="q"
                defaultValue={query}
                maxLength={80}
                placeholder="Filter by name, code or subject…"
              />
            </div>
            <div className="toolbar-group">
              <button className="btn btn-secondary" type="submit">
                <Search aria-hidden="true" />
                Filter
              </button>
              {query ? (
                <Link className="btn btn-ghost" href="/departments">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          <section className="section" aria-labelledby="all-departments">
            <SectionHeader
              eyebrow="Directory"
              title={query ? `Matching “${query}”` : "All departments"}
              id="all-departments"
              description={`${visible.length} of ${departments.length} departments shown.`}
            />

            {visible.length === 0 ? (
              <EmptyState
                icon={query ? Search : Building2}
                title={query ? "No department matches that filter" : "No departments registered"}
                description={
                  query
                    ? `Nothing in the directory matches “${query}”. Try a shorter term, a department code such as CSE, or clear the filter to see all ${departments.length} departments.`
                    : "The department registry is empty, so there is nothing to browse yet."
                }
                actions={
                  query ? (
                    <>
                      <Link className="btn" href="/departments">
                        Clear filter
                      </Link>
                      <Link className="btn btn-secondary" href="/search">
                        <Megaphone aria-hidden="true" />
                        Search notices instead
                      </Link>
                    </>
                  ) : null
                }
              />
            ) : (
              <div className="department-grid">
                {visible.map((department) => (
                  <DepartmentCard key={department.slug} department={department} />
                ))}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="departments-elsewhere">
            <SectionHeader
              eyebrow="Elsewhere"
              title="Looking for archive files?"
              id="departments-elsewhere"
              description="The department pages above carry notices; the dedicated archive view carries the migrated document tree."
            />
            <div className="quick-access">
              <Link className="quick-access-item" href="/archive">
                <span className="quick-access-icon" aria-hidden="true">
                  <FileStack />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">Browse the college archive</span>
                  <span className="quick-access-hint">
                    The same departments, opened directly into their folders
                  </span>
                </span>
              </Link>
              <Link className="quick-access-item" href="/search">
                <span className="quick-access-icon" aria-hidden="true">
                  <Search />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">Search everything</span>
                  <span className="quick-access-hint">
                    Notices, departments and archive files in one query
                  </span>
                </span>
              </Link>
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
