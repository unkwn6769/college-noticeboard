import Link from "next/link";
import { ChevronRight, FolderOpen } from "lucide-react";
import FileIcon from "@/src/components/FileIcon";
import EmptyState from "@/src/components/EmptyState";
import { fileTypeLabel, formatBytes, formatDate } from "@/src/lib/format";

export type BrowserFolder = { name: string; href: string; fileCount: number };
export type BrowserFile = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
  href: string;
};

type Crumb = { label: string; href: string };

type Props = {
  title: string;
  description: string;
  breadcrumbs: Crumb[];
  folders: BrowserFolder[];
  files: BrowserFile[];
  empty: {
    title: string;
    description: string;
    action?: { label: string; href: string };
  };
  /** Rendered between the heading and the listing (sorting, filters). */
  controls?: React.ReactNode;
  pagination?: React.ReactNode;
};

/**
 * The document browser used by both the department route and the dedicated
 * archive route, so folders, files, breadcrumbs, empty states and pagination
 * cannot drift apart between the two entry points.
 *
 * Folders and files are visually distinct object types, not two shades of the
 * same row: folders are cards with a folder glyph and a resource count;
 * files are dense rows with a type icon, size and date.
 */
export default function ArchiveBrowser({
  title,
  description,
  breadcrumbs,
  folders,
  files,
  empty,
  controls,
  pagination,
}: Props) {
  return (
    <section className="section" aria-labelledby="archive-browser-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Archive</p>
          <h2 className="section-title" id="archive-browser-title">
            {title}
          </h2>
          <p className="section-description">{description}</p>
        </div>
      </div>

      <nav aria-label="Archive location" style={{ marginBottom: "var(--space-4)" }}>
        <ol
          className="breadcrumbs"
          style={{ margin: 0, listStyle: "none", padding: 0 }}
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <li key={crumb.href} className="row row-2" style={{ gap: 2 }}>
                {index > 0 ? (
                  <span className="breadcrumb-sep" aria-hidden="true">
                    <ChevronRight />
                  </span>
                ) : null}
                {isLast ? (
                  <span aria-current="page" title={crumb.label}>
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href}>{crumb.label}</Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {controls}

      {folders.length > 0 ? (
        <ul className="folder-grid" style={{ listStyle: "none", padding: 0 }} aria-label="Folders">
          {folders.map((folder) => (
            <li key={folder.href}>
              <Link className="folder-card" href={folder.href} title={folder.name}>
                <span className="folder-icon" aria-hidden="true">
                  <FolderOpen />
                </span>
                <span className="folder-main">
                  <span className="folder-name">{folder.name}</span>
                  <span className="folder-count">
                    {folder.fileCount.toLocaleString("en-IN")}{" "}
                    {folder.fileCount === 1 ? "resource" : "resources"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="stack stack-2" style={{ listStyle: "none", padding: 0 }} aria-label="Files">
          {files.map((file) => (
            <li key={file.id}>
              <Link className="file-row" href={file.href}>
                <span className="resource-icon" aria-hidden="true">
                  <FileIcon name={file.original_name} mimeType={file.mime_type} />
                </span>
                <span className="resource-main">
                  <span className="file-row-name" title={file.original_name}>
                    {file.original_name}
                  </span>
                  <span className="file-row-meta">
                    <span className="file-row-type">
                      {fileTypeLabel(file.original_name, file.mime_type)}
                    </span>
                    <span>{formatBytes(file.size_bytes)}</span>
                    <span className="file-row-meta-sep" aria-hidden="true" />
                    <time dateTime={file.created_at}>{formatDate(file.created_at)}</time>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {folders.length === 0 && files.length === 0 ? (
        <EmptyState
          title={empty.title}
          description={empty.description}
          icon={FolderOpen}
          actions={
            empty.action ? (
              <Link className="btn btn-secondary" href={empty.action.href}>
                {empty.action.label}
              </Link>
            ) : null
          }
        />
      ) : null}

      {pagination}
    </section>
  );
}
