import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileStack, Fingerprint, FolderTree, Info } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import FileIcon from "@/src/components/FileIcon";
import PrintButton from "@/src/components/PrintButton";
import { getDepartment } from "@/src/lib/departments";
import { getArchiveFile } from "@/src/lib/archive";
import { fileTypeLabel, formatBytes, formatDateTime } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ department: string; id: string }>;
}) {
  const { department: slug, id } = await params;
  const department = getDepartment(slug);
  if (!department) return { title: "Resource not found" };
  const file = await getArchiveFile({ department: slug, id }).catch(() => null);
  if (!file) return { title: "Resource not found" };
  return {
    title: file.original_name,
    description: `${file.original_name} — an archived resource of ${department.name}.`,
  };
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

  const segments = file.legacy_relative_path
    ? file.legacy_relative_path.split("/")
    : [];

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Archive", href: "/archive" },
              { label: department.shortName, href: `/departments/${department.slug}` },
              { label: file.original_name },
            ]}
          />

          <div className="reading-actions no-print row row-2" style={{ marginBottom: 16 }}>
            <Link className="btn btn-ghost btn-sm" href={`/departments/${department.slug}`}>
              <ArrowLeft aria-hidden="true" />
              Department archive
            </Link>
          </div>

          <article className="file-detail-card">
            <div className="row row-3" style={{ alignItems: "flex-start" }}>
              <span className="resource-icon" aria-hidden="true" style={{ width: 40, height: 40 }}>
                <FileIcon name={file.original_name} mimeType={file.mime_type} />
              </span>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <p className="eyebrow">Archive resource</p>
                <h1 className="file-detail-title">{file.original_name}</h1>
              </div>
            </div>

            <p className="section-description" style={{ marginTop: 12 }}>
              Held in the {department.name} archive. This resource is active and available
              for public download.
            </p>

            <dl className="definition-grid" style={{ marginTop: "var(--space-5)" }}>
              <div className="definition">
                <dt>Type</dt>
                <dd>
                  {fileTypeLabel(file.original_name, file.mime_type)} · {file.mime_type}
                </dd>
              </div>
              <div className="definition">
                <dt>Size</dt>
                <dd>{formatBytes(file.size_bytes, { fallback: "Unknown size" })}</dd>
              </div>
              <div className="definition">
                <dt>Archived on</dt>
                <dd>
                  <time dateTime={file.created_at}>
                    {formatDateTime(file.created_at, { fallback: "Unknown" })}
                  </time>
                </dd>
              </div>
              <div className="definition">
                <dt>Last updated</dt>
                <dd>{formatDateTime(file.updated_at, { fallback: "Unknown" })}</dd>
              </div>
            </dl>

            <div className="stack stack-2" style={{ marginTop: "var(--space-5)" }}>
              <p className="metric-label">
                <Fingerprint aria-hidden="true" style={{ width: 14, height: 14 }} />
                SHA-256 checksum
              </p>
              <p className="hash" style={{ margin: 0 }}>
                {file.sha256}
              </p>
              <p className="field-hint">
                Verify a downloaded copy by comparing its SHA-256 digest with the value
                above. Any difference means the bytes are not the archived bytes.
              </p>
            </div>

            {file.legacy_relative_path ? (
              <div className="stack stack-2" style={{ marginTop: "var(--space-5)" }}>
                <p className="metric-label">
                  <FolderTree aria-hidden="true" style={{ width: 14, height: 14 }} />
                  Logical archive path
                </p>
                <ol
                  className="stack stack-1"
                  style={{ listStyle: "none", padding: 0, margin: 0 }}
                  aria-label="Archive path segments"
                >
                  <li>
                    <Link className="path-code" href={`/departments/${department.slug}`}>
                      {segments[0] ?? department.slug}
                    </Link>
                  </li>
                  {segments.slice(1).map((segment, index) => {
                    const partial = segments.slice(0, index + 2).join("/");
                    return (
                      <li key={partial}>
                        <Link
                          className="path-code"
                          href={`/departments/${department.slug}?path=${encodeURIComponent(partial)}`}
                        >
                          {segment}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
                <p className="field-hint">
                  <Info aria-hidden="true" style={{ width: 13, height: 13, display: "inline" }} />{" "}
                  This is a logical path reconstructed from the legacy source. It is not a
                  filesystem location.
                </p>
              </div>
            ) : null}

            <div className="file-detail-actions">
              <a className="btn" href={`/api/files/${file.id}`}>
                <Download aria-hidden="true" />
                Download file
              </a>
              <PrintButton label="Print details" />
              <span className="meta" style={{ flex: "1 1 12rem" }}>
                <FileStack aria-hidden="true" style={{ width: 13, height: 13, display: "inline" }} />{" "}
                Downloads are streamed from storage; no copy is made first.
              </span>
            </div>
          </article>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
