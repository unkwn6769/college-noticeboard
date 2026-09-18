import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import { getDepartment } from "@/src/lib/departments";
import { getArchiveFile } from "@/src/lib/archive";

export const dynamic = "force-dynamic";

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

export default async function ArchiveFilePage({
  params,
}: {
  params: Promise<{ department: string; id: string }>;
}) {
  const { department: slug, id } = await params;
  const department = getDepartment(slug);
  if (!department) notFound();

  let file;
  try {
    file = await getArchiveFile({ department: slug, id });
  } catch {
    notFound();
  }
  if (!file) notFound();

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <Link className="public-back-link" href={`/departments/${department.slug}`}>← Department archive</Link>
        <article className="public-file-detail card-soft">
          <span className="public-eyebrow">Archive file</span>
          <h1>{file.original_name}</h1>
          <p className="lead">{department.name}</p>
          <dl className="public-file-detail-grid">
            <div><dt>Type</dt><dd>{file.mime_type}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(file.size_bytes)}</dd></div>
            <div><dt>Archived</dt><dd>{new Date(file.created_at).toLocaleString("en-IN")}</dd></div>
            <div><dt>SHA-256</dt><dd className="public-hash">{file.sha256}</dd></div>
          </dl>
          <div className="public-file-detail-path">
            <span className="stat-label">Legacy provenance path</span>
            <code>{file.legacy_relative_path ?? "—"}</code>
          </div>
          <div className="public-file-detail-actions">
            <span className="muted">Public file download is deliberately kept behind the dedicated download-authorization milestone.</span>
          </div>
        </article>
      </main>
      <PublicFooter />
    </>
  );
}
