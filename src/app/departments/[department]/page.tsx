import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileStack, Megaphone, Search } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import PageHeader from "@/src/components/PageHeader";
import SectionHeader from "@/src/components/SectionHeader";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import ArchiveBrowser from "@/src/components/ArchiveBrowser";
import NoticeCard, { type NoticeCardData } from "@/src/components/NoticeCard";
import EmptyState from "@/src/components/EmptyState";
import { getDepartment, listDepartmentStats } from "@/src/lib/departments";
import { listArchiveDirectory } from "@/src/lib/archive";
import { listPublishedNotices } from "@/src/lib/notices";
import { formatCount, formatDate } from "@/src/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ path?: string; page?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  const { department: slug } = await params;
  const department = getDepartment(slug);
  if (!department) return { title: "Department not found" };
  return {
    title: department.name,
    description: `${department.description} Notices and archived resources for ${department.name}.`,
  };
}

function encodePath(path: string): string {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  return params.toString() ? `?${params.toString()}` : "";
}

function breadcrumbParts(path: string): Array<{ name: string; path: string }> {
  if (!path) return [];
  const segments = path.split("/");
  return segments.map((name, index) => ({
    name,
    path: segments.slice(0, index + 1).join("/"),
  }));
}

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ department: string }>;
  searchParams: SearchParams;
}) {
  const { department: slug } = await params;
  const query = await searchParams;
  const department = getDepartment(slug);
  if (!department) notFound();

  const departmentStats = (await listDepartmentStats()).find(
    (item) => item.slug === department.slug,
  );
  if (!departmentStats) notFound();

  const page = Number.parseInt(query.page ?? "1", 10);

  let archive;
  try {
    archive = await listArchiveDirectory({ department: slug, path: query.path, page });
  } catch {
    notFound();
  }

  const notices = await listPublishedNotices("", 6, { department: slug });

  const breadcrumbs = breadcrumbParts(archive.path);
  const previousPage = archive.page > 1 ? archive.page - 1 : null;
  const nextPage = archive.page < archive.totalPages ? archive.page + 1 : null;
  const archivePath = encodePath(archive.path);
  // A page number past the end is a valid request; it must not be reported as
  // an empty folder, and it must still offer a way back.
  const outOfRange = archive.totalFiles > 0 && archive.page > archive.totalPages;
  const pageSuffix = archivePath ? "&" : "?";

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
                  { label: "Departments", href: "/departments" },
                  { label: department.shortName, href: `/departments/${department.slug}` },
                  ...breadcrumbs.map((crumb) => ({
                    label: crumb.name,
                    href: `/departments/${department.slug}${encodePath(crumb.path)}`,
                  })),
                ]}
                currentLabel={archive.path}
              />
            }
            eyebrow={department.shortName}
            title={department.name}
            description={department.description}
            size="small"
            actions={
              <>
                <Link className="btn btn-secondary" href={`/archive/${department.slug}`}>
                  <FileStack aria-hidden="true" />
                  Open in archive
                </Link>
                <Link
                  className="btn btn-secondary"
                  href={`/search?q=${encodeURIComponent(department.name)}`}
                >
                  <Search aria-hidden="true" />
                  Search
                </Link>
              </>
            }
          />

          <section className="department-hero" aria-label="Department summary">
            <div>
              <span className="department-code">{department.shortName}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>
                {notices.length > 0
                  ? `${notices.length} published notice${notices.length === 1 ? "" : "s"}`
                  : "No published notices yet"}
              </h2>
              <p className="section-description">
                {departmentStats.resourceCount > 0
                  ? `${formatCount(departmentStats.resourceCount)} resources are held in the migrated archive for this department.`
                  : "No resources have been migrated into the archive for this department."}
              </p>
              <div className="actions" style={{ marginTop: 16 }}>
                <Link className="link-arrow" href="#notices">
                  Jump to notices
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link className="link-arrow" href="#archive-browser-title">
                  Jump to archive
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="department-hero-stats">
              <div className="department-hero-stat">
                <span className="metric-label">
                  <FileStack aria-hidden="true" />
                  Archived resources
                </span>
                <strong>{formatCount(archive.totalDepartmentFiles)}</strong>
              </div>
              <div className="department-hero-stat">
                <span className="metric-label">Latest archive update</span>
                <strong className="is-date">
                  {departmentStats.latestUpdate
                    ? formatDate(departmentStats.latestUpdate)
                    : "No update yet"}
                </strong>
              </div>
            </div>
          </section>

          <section className="section" id="notices" aria-labelledby="department-notices-title">
            <SectionHeader
              eyebrow="Notices"
              title={`Notices from ${department.shortName}`}
              id="department-notices-title"
              description="Published notices belonging to this department."
              action={
                notices.length > 0 ? (
                  <Link
                    className="link-arrow"
                    href={`/search?q=${encodeURIComponent(department.name)}`}
                  >
                    Search more
                    <ArrowRight aria-hidden="true" />
                  </Link>
                ) : null
              }
            />
            {notices.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title={`No published notices for ${department.shortName}`}
                description="This department has not published any notices to the public noticeboard yet. Its archive resources are still browsable below."
              />
            ) : (
              <div className="notice-list">
                {notices.map((notice) => (
                  <NoticeCard key={notice.id} notice={notice as NoticeCardData} excerpt={false} />
                ))}
              </div>
            )}
          </section>

          <ArchiveBrowser
            title={archive.path ? archive.path.split("/").at(-1) ?? "Folder" : "Department archive"}
            description="Browse the migrated archive as a virtual folder hierarchy. Physical storage locations are never exposed."
            folders={archive.folders.map((folder) => ({
              name: folder.name,
              href: `/departments/${department.slug}${encodePath(folder.path)}`,
              fileCount: folder.fileCount,
            }))}
            files={archive.files.map((file) => ({
              id: file.id,
              original_name: file.original_name,
              mime_type: file.mime_type,
              size_bytes: file.size_bytes,
              created_at: file.created_at,
              href: `/departments/${department.slug}/file/${file.id}`,
            }))}
            empty={
              outOfRange
                ? {
                    title: "No files on this page",
                    description: `Page ${archive.page} is past the end of this folder, which has ${archive.totalFiles.toLocaleString("en-IN")} file${archive.totalFiles === 1 ? "" : "s"} in total.`,
                    action: {
                      label: "Back to the first page",
                      href: `/departments/${department.slug}${archivePath}${pageSuffix}page=1`,
                    },
                  }
                : archive.path
                  ? {
                      title: "This folder is empty",
                      description:
                        "There are no active files directly inside this archive location. Use the breadcrumb above to go back to a parent folder.",
                      action: {
                        label: "Back to the department archive",
                        href: `/departments/${department.slug}`,
                      },
                    }
                  : {
                      title: "No migrated resources",
                      description:
                        "This department is present in the directory, but no active migrated resources are available yet.",
                      action: {
                        label: "Browse the college archive",
                        href: "/archive",
                      },
                    }
            }
            pagination={
              archive.totalPages > 1 ? (
                <nav className="pagination" aria-label="Archive pagination">
                  {previousPage ? (
                    <Link
                      className="btn btn-secondary btn-sm"
                      href={`/departments/${department.slug}${archivePath}${pageSuffix}page=${previousPage}`}
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
                      href={`/departments/${department.slug}${archivePath}${pageSuffix}page=${nextPage}`}
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
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
