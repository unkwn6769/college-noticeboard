import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import SectionHeader from "@/src/components/SectionHeader";
import { getDepartment, listDepartmentStats } from "@/src/lib/departments";
import { listArchiveDirectory } from "@/src/lib/archive";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ path?: string; page?: string }>;

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

function formatDate(value: string | null): string {
  if (!value) return "No archive update yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No archive update yet";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function encodePath(path: string): string {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  return params.toString() ? `?${params.toString()}` : "";
}

function breadcrumbParts(path: string): Array<{ name: string; path: string }> {
  if (!path) return [];
  const segments = path.split("/");
  return segments.map((name, index) => ({ name, path: segments.slice(0, index + 1).join("/") }));
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

  const breadcrumbs = breadcrumbParts(archive.path);
  const previousPage = archive.page > 1 ? archive.page - 1 : null;
  const nextPage = archive.page < archive.totalPages ? archive.page + 1 : null;
  const archivePath = encodePath(archive.path);

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <Link className="public-back-link" href="/departments">← All departments</Link>

        <section className="public-department-hero card-soft">
          <div>
            <span className="public-department-code">{department.shortName}</span>
            <h1>{department.name}</h1>
            <p className="lead">{department.description}</p>
          </div>
          <div className="public-department-hero-stats">
            <div className="public-department-hero-stat">
              <span className="stat-label">Archived resources</span>
              <strong>{archive.totalDepartmentFiles.toLocaleString("en-IN")}</strong>
            </div>

            <div className="public-department-hero-stat">
              <span className="stat-label">Latest archive update</span>
              <strong className="public-department-hero-date">
                {formatDate(departmentStats.latestUpdate)}
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
            <Link href={`/departments/${department.slug}`}>Root</Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.path}>
                <span className="public-breadcrumb-separator">/</span>
                <Link href={`/departments/${department.slug}${encodePath(crumb.path)}`}>{crumb.name}</Link>
              </span>
            ))}
          </div>

          {archive.folders.length > 0 ? (
            <div className="public-archive-grid">
              {archive.folders.map((folder) => (
                <Link
                  className="public-folder-card"
                  href={`/departments/${department.slug}${encodePath(folder.path)}`}
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
                  href={`/departments/${department.slug}/file/${file.id}`}
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
                  : "This department is present in the directory, but no active migrated resources are available."}
              </p>
            </div>
          ) : null}

          {archive.totalPages > 1 ? (
            <div className="public-pagination">
              {previousPage ? (
                <Link className="btn secondary" href={`/departments/${department.slug}${archivePath}${archivePath ? "&" : "?"}page=${previousPage}`}>
                  Previous
                </Link>
              ) : <span />}
              <span className="muted">Files in this folder: {archive.totalFiles.toLocaleString("en-IN")} · Page {archive.page} of {archive.totalPages}</span>
              {nextPage ? (
                <Link className="btn" href={`/departments/${department.slug}${archivePath}${archivePath ? "&" : "?"}page=${nextPage}`}>
                  Next
                </Link>
              ) : <span />}
            </div>
          ) : null}
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
