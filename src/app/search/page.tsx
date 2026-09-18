import Link from "next/link";
import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import SectionHeader from "@/src/components/SectionHeader";
import { getMeaningfulLegacyPath } from "@/src/lib/file-search";
import { searchPublicNoticeboard } from "@/src/lib/public-search";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatBytes(value: string | number): string {
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = await searchPublicNoticeboard(q);
  const totalShown =
    results.notices.length + results.departments.length + results.files.length;

  return (
    <>
      <PublicNav />
      <main className="container page public-page">
        <section className="public-search-header">
          <p className="public-eyebrow">Search</p>
          <h1>Search the noticeboard</h1>
          <p className="lead">
            Search published notices, departments and migrated archive resources from one place.
          </p>

          <form className="public-hero-search public-search-form" action="/search" method="get">
            <input
              name="q"
              defaultValue={results.query}
              aria-label="Search the noticeboard"
              placeholder="Try a notice title, department, or file name..."
              autoFocus
            />
            <button className="btn" type="submit">Search</button>
          </form>
        </section>

        {!results.query ? (
          <div className="empty-state card">
            <h2>Start with a keyword</h2>
            <p className="muted">
              Search across official notices, departments and the migrated archive.
            </p>
          </div>
        ) : (
          <>
            <div className="public-search-summary">
              <strong>Results for “{results.query}”</strong>
              <span className="muted">{totalShown.toLocaleString("en-IN")} top matches shown</span>
            </div>

            <section className="public-section-block">
              <SectionHeader
                eyebrow="Notices"
                title="Published notices"
                description="Official notices matching your search."
              />
              {results.notices.length === 0 ? (
                <div className="empty-state card"><p className="muted">No matching notices.</p></div>
              ) : (
                <div className="public-search-list">
                  {results.notices.map((notice) => (
                    <Link className="public-search-result card" href={`/notices/${notice.id}`} key={notice.id}>
                      <div>
                        <p className="public-eyebrow">{formatDate(notice.published_at)}</p>
                        <h3>{notice.title}</h3>
                        <p className="muted">
                          {String(notice.body).slice(0, 180)}
                          {String(notice.body).length > 180 ? "…" : ""}
                        </p>
                      </div>
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="public-section-block">
              <SectionHeader
                eyebrow="Departments"
                title="Department matches"
                description="Jump directly into a relevant department."
              />
              {results.departments.length === 0 ? (
                <div className="empty-state card"><p className="muted">No matching departments.</p></div>
              ) : (
                <div className="public-search-department-grid">
                  {results.departments.map((department) => (
                    <Link
                      className="public-search-department card-soft"
                      href={`/departments/${department.slug}`}
                      key={department.slug}
                    >
                      <span className="public-department-code">{department.shortName}</span>
                      <strong>{department.name}</strong>
                      <span className="muted">
                        {department.resourceCount.toLocaleString("en-IN")} resources
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="public-section-block">
              <SectionHeader
                eyebrow="Archive"
                title="Resource matches"
                description="Files from the verified migrated archive."
              />
              {results.files.length === 0 ? (
                <div className="empty-state card"><p className="muted">No matching archive resources.</p></div>
              ) : (
                <div className="public-search-list">
                  {results.files.map((file) => {
                    const meaningfulPath = getMeaningfulLegacyPath(
                      file.legacy_relative_path,
                      file.legacy_department,
                    );
                    return (
                      <Link
                        className="public-search-result card"
                        href={`/departments/${file.legacy_department}/file/${file.id}`}
                        key={file.id}
                      >
                        <div>
                          <p className="public-eyebrow">
                            {file.legacy_department?.replace("-noticeboard", "") ?? "Archive"}
                          </p>
                          <h3>{file.original_name}</h3>
                          <p className="muted">
                            {meaningfulPath || "Archive resource"} · {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                          </p>
                        </div>
                        <span aria-hidden="true">→</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
