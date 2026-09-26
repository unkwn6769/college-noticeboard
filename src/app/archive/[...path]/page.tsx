import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, FileStack, Search } from "lucide-react";

import PublicFooter from "@/src/components/PublicFooter";
import PublicNav from "@/src/components/PublicNav";
import PageHeader from "@/src/components/PageHeader";
import SectionHeader from "@/src/components/SectionHeader";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import ArchiveBrowser from "@/src/components/ArchiveBrowser";
import { listArchiveDirectory } from "@/src/lib/archive";
import { getDepartment, listDepartmentStats } from "@/src/lib/departments";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ page?: string }>;
};

function archiveHref(parts: string[]): string {
  if (parts.length === 0) return "/archive";
  return `/archive/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

function breadcrumbParts(departmentSlug: string, path: string) {
  const parts = path ? path.split("/") : [];
  return parts.map((name, index) => ({
    name,
    href: archiveHref([departmentSlug, ...parts.slice(0, index + 1)]),
  }));
}

export default async function ArchiveBrowserPage({ params, searchParams }: Props) {
  const { path: segments } = await params;
  if (!segments || segments.length === 0) notFound();

  const departmentSlug = decodeURIComponent(segments[0]);
  const department = getDepartment(departmentSlug);
  if (!department) notFound();

  const archivePath = segments.slice(1).map(decodeURIComponent).join("/");
  const query = await searchParams;
  const page = Number.parseInt(query.page ?? "1", 10);

  const departmentStats = await listDepartmentStats();

  let archive;
  try {
    archive = await listArchiveDirectory({
      department: departmentSlug,
      path: archivePath,
      page,
    });
  } catch {
    notFound();
  }

  const stats = departmentStats.find((item) => item.slug === departmentSlug);
  if (!stats) notFound();

  const breadcrumbs = breadcrumbParts(departmentSlug, archive.path);
  const currentParts = archive.path
    ? [departmentSlug, ...archive.path.split("/")]
    : [departmentSlug];
  const previousPage = archive.page > 1 ? archive.page - 1 : null;
  const nextPage = archive.page < archive.totalPages ? archive.page + 1 : null;
  const pageHref = (pageNumber: number) => `${archiveHref(currentParts)}?page=${pageNumber}`;

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <PageHeader
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "Home", href: "/" },
                  { label: "Archive", href: "/archive" },
                  { label: department.shortName, href: archiveHref([departmentSlug]) },
                  ...breadcrumbs.map((crumb) => ({ label: crumb.name, href: crumb.href })),
                ]}
                currentLabel={archive.path || department.name}
              />
            }
            eyebrow={department.shortName}
            title={archive.path ? archive.path.split("/").at(-1) ?? "Folder" : department.name}
            description={archive.path ? `Archive folder in ${department.name}.` : department.description}
            size="small"
            actions={
              <>
                <Link className="btn btn-secondary" href={`/departments/${departmentSlug}`}>
                  <FileStack aria-hidden="true" />
                  Department page
                </Link>
                <Link className="btn btn-secondary" href="/archive">
                  <ArrowLeft aria-hidden="true" />
                  All departments
                </Link>
              </>
            }
          />

          <section className="department-hero" aria-label="Department summary">
            <div>
              <span className="department-code">{department.shortName}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>
                {stats.resourceCount.toLocaleString("en-IN")} archived resource
                {stats.resourceCount === 1 ? "" : "s"}
              </h2>
              <p className="section-description">
                {stats.latestUpdate
                  ? `Latest archive update ${new Date(stats.latestUpdate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.`
                  : "No archive update has been recorded for this department yet."}
              </p>
            </div>

            <div className="department-hero-stats">
              <div className="department-hero-stat">
                <span className="metric-label">
                  <FileStack aria-hidden="true" />
                  Archived resources
                </span>
                <strong>{stats.resourceCount.toLocaleString("en-IN")}</strong>
              </div>
              <div className="department-hero-stat">
                <span className="metric-label">Latest archive update</span>
                <strong className="is-date">
                  {stats.latestUpdate
                    ? new Date(stats.latestUpdate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "No update yet"}
                </strong>
              </div>
            </div>
          </section>

          <ArchiveBrowser
            title={archive.path ? archive.path.split("/").at(-1) ?? "Folder" : "Department archive"}            description="Browse the migrated archive as a virtual folder hierarchy. Physical storage locations are never exposed."
            folders={archive.folders.map((folder) => ({
              name: folder.name,
              href: archiveHref([departmentSlug, ...folder.path.split("/")]),
              fileCount: folder.fileCount,
            }))}
            files={archive.files.map((file) => ({
              id: file.id,
              original_name: file.original_name,
              mime_type: file.mime_type,
              size_bytes: file.size_bytes,
              created_at: file.created_at,
              href: `/departments/${departmentSlug}/file/${file.id}`,
            }))}
            empty={
              archive.path
                ? {
                    title: "Folder is empty",
                    description:
                      "There are no active files directly inside this archive location.",
                  }
                : {
                    title: "No migrated resources",
                    description:
                      "This department is present in the archive, but no active migrated resources are available.",
                  }
            }
            pagination={
              archive.totalPages > 1 ? (
                <nav className="pagination" aria-label="Archive pagination">
                  {previousPage ? (
                    <Link
                      className="btn btn-secondary btn-sm"
                      href={pageHref(previousPage)}
                      rel="prev"
                    >
                      <ArrowLeft aria-hidden="true" />
                      Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <p className="pagination-info">
                    Page {archive.page} of {archive.totalPages} ·{" "}
                    {archive.totalFiles.toLocaleString("en-IN")} file
                    {archive.totalFiles === 1 ? "" : "s"} in this folder
                  </p>
                  {nextPage ? (
                    <Link
                      className="btn btn-secondary btn-sm"
                      href={pageHref(nextPage)}
                      rel="next"
                    >
                      Next
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null
            }
          />

          <section className="section" aria-labelledby="archive-next">
            <SectionHeader eyebrow="Next" title="Other ways in" id="archive-next" />
            <div className="quick-access">
              <Link className="quick-access-item" href={`/departments/${departmentSlug}`}>
                <span className="quick-access-icon" aria-hidden="true">
                  <FileStack />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">Department page</span>
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
              <Link className="quick-access-item" href="/archive">
                <span className="quick-access-icon" aria-hidden="true">
                  <Building2 />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">All departments</span>
                  <span className="quick-access-hint">Back to the archive directory</span>
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
