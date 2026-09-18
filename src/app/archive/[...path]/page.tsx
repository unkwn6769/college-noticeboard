import Link from "next/link";
import { notFound } from "next/navigation";

import PublicFooter from "@/src/components/PublicFooter";
import PublicNav from "@/src/components/PublicNav";
import SectionHeader from "@/src/components/SectionHeader";
import { listArchiveDirectory } from "@/src/lib/archive";
import { getDepartment, listDepartmentStats } from "@/src/lib/departments";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ page?: string }>;
};

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = bytes;
  let unit = -1;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

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

  const [departmentStats, archive] = await Promise.all([
    listDepartmentStats(),
    listArchiveDirectory({ department: departmentSlug, path: archivePath, page }),
  ]);

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
      <main className="container page public-page">
        <Link className="public-back-link" href="/archive">← All archive departments</Link>

        <section className="public-department-hero card-soft">
          <div>
            <span className="public-department-code">{department.shortName}</span>
            <h1>{department.name}</h1>
            <p className="lead">{department.description}</p>
          </div>
          <div className="public-department-hero-stats">
            <div className="public-department-hero-stat">
              <span className="stat-label">Archived resources</span>
              <strong>{stats.resourceCount.toLocaleString("en-IN")}</strong>
            </div>
            <div className="public-department-hero-stat">
              <span className="stat-label">Latest archive update</span>
              <strong className="public-department-hero-date">
                {stats.latestUpdate
                  ? new Date(stats.latestUpdate).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "No archive update yet"}
              </strong>
            </div>
          </div>
        </section>

        <section className="public-section-block">
          <SectionHeader
            eyebrow="Archive"
            title={archive.path ? archive.path.split("/").at(-1) ?? "Folder" : "Department archive"}
            description="Browse the migrated archive as a virtual folder hierarchy. Physical storage paths are never exposed."
          />

          <div className="public-breadcrumbs" aria-label="Archive location">
            <Link href={archiveHref([departmentSlug])}>Root</Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.href}>
                <span className="public-breadcrumb-separator">/</span>
                <Link href={crumb.href}>{crumb.name}</Link>
              </span>
            ))}
          </div>

          {archive.folders.length > 0 ? (
            <div className="public-archive-grid">
              {archive.folders.map((folder) => (
                <Link
                  className="public-folder-card"
                  href={archiveHref([departmentSlug, ...folder.path.split("/")])}
                  key={folder.path}
                >
                  <span className="public-folder-icon" aria-hidden="true">DIR</span>
                  <strong>{folder.name}</strong>
                  <span className="muted">{folder.fileCount.toLocaleString("en-IN")} resources</span>
                </Link>
              ))}
            </div>
          ) : null}

          {archive.files.length > 0 ? (
            <div className="public-file-list">
              {archive.files.map((file) => (
                <Link
                  className="public-file-row"
                  href={`/departments/${departmentSlug}/file/${file.id}`}
                  key={file.id}
                >
                  <span className="public-file-row-main">
                    <strong>{file.original_name}</strong>
                    <span className="muted">{file.mime_type} · {formatBytes(file.size_bytes)}</span>
                  </span>
                  <span className="public-file-row-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : null}

          {archive.folders.length === 0 && archive.files.length === 0 ? (
            <div className="empty-state card">
              {archive.path ? <h2>Folder is empty</h2> : <h2>No migrated resources</h2>}
              <p className="muted">
                {archive.path
                  ? "There are no active files directly inside this archive location."
                  : "This department is present in the archive, but no active migrated resources are available."}
              </p>
            </div>
          ) : null}

          {archive.totalPages > 1 ? (
            <div className="public-pagination">
              {previousPage ? <Link className="btn secondary" href={pageHref(previousPage)}>Previous</Link> : <span />}
              <span className="muted">
                Files in this folder: {archive.totalFiles.toLocaleString("en-IN")} · Page {archive.page} of {archive.totalPages}
              </span>
              {nextPage ? <Link className="btn" href={pageHref(nextPage)}>Next</Link> : <span />}
            </div>
          ) : null}
        </section>

        <section className="public-quick-links">
          <Link className="public-quick-link card-soft" href={`/departments/${departmentSlug}`}>
            <span><span className="public-eyebrow">Department</span><strong>Department page</strong></span>
            <span>→</span>
          </Link>
          <Link className="public-quick-link card-soft" href="/search">
            <span><span className="public-eyebrow">Discovery</span><strong>Search the portal</strong></span>
            <span>→</span>
          </Link>
          <Link className="public-quick-link card-soft" href="/archive">
            <span><span className="public-eyebrow">Archive</span><strong>All departments</strong></span>
            <span>→</span>
          </Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
