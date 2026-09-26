import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Building2, FileStack, Megaphone, Search, X } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import PageHeader from "@/src/components/PageHeader";
import SectionHeader from "@/src/components/SectionHeader";
import EmptyState from "@/src/components/EmptyState";
import FileIcon from "@/src/components/FileIcon";
import { getMeaningfulLegacyPath } from "@/src/lib/file-search";
import { searchPublicNoticeboard } from "@/src/lib/public-search";
import { fileTypeLabel, formatBytes, formatDate, truncate } from "@/src/lib/format";

export const dynamic = "force-dynamic";

const SUGGESTIONS = ["examination", "timetable", "admission", "notice", "circular"] as const;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  return {
    title: query ? `Search: ${query}` : "Search",
    description:
      "Search published notices, departments and migrated archive resources.",
    robots: { index: false, follow: true },
  };
}

/**
 * Renders the query with every literal occurrence of the search term marked,
 * so a visitor can see why a result matched. Matching is case-insensitive and
 * literal; the text is escaped by React, so this cannot inject markup.
 */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const term = query.trim();
  if (term.length < 2) return text;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={index}>{part}</mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = await searchPublicNoticeboard(q);
  const query = results.query;
  const totalShown =
    results.notices.length + results.departments.length + results.files.length;
  const hasQuery = query.length > 0;
  const nothingFound = hasQuery && totalShown === 0;

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <div className="container">
          <div className="search-hero">
            <PageHeader
              eyebrow="Search"
              title="Search the noticeboard"
              description="Search published notices, departments and the migrated archive from a single query."
            />

            <form className="search-form" action="/search" method="get" role="search">
              <div className="search-field" style={{ flex: 1 }}>
                <Search aria-hidden="true" />
                <label className="sr-only" htmlFor="q">
                  Search the noticeboard
                </label>
                <input
                  id="q"
                  className="input"
                  name="q"
                  type="search"
                  defaultValue={query}
                  maxLength={100}
                  placeholder="A notice title, department, subject or file name…"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>
              <button className="btn" type="submit">
                <Search aria-hidden="true" />
                Search
              </button>
              {hasQuery ? (
                <Link className="btn btn-ghost" href="/search">
                  <X aria-hidden="true" />
                  Clear
                </Link>
              ) : null}
            </form>

            {!hasQuery ? (
              <div className="suggestion-list" style={{ marginTop: "var(--space-4)" }}>
                <span className="meta" style={{ alignSelf: "center", marginRight: 4 }}>
                  Try:
                </span>
                {SUGGESTIONS.map((suggestion) => (
                  <Link className="chip" key={suggestion} href={`/search?q=${suggestion}`}>
                    {suggestion}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {nothingFound ? (
            <EmptyState
              icon={Search}
              title={`No results for “${query}”`}
              description="Nothing in published notices, the department directory or the migrated archive matches that term. Archive search matches file names and legacy paths, so try a shorter or more general keyword."
              actions={
                <>
                  <Link className="btn" href="/search">
                    <X aria-hidden="true" />
                    Clear the search
                  </Link>
                  <Link className="btn btn-secondary" href="/departments">
                    <Building2 aria-hidden="true" />
                    Browse departments
                  </Link>
                </>
              }
            />
          ) : null}

          {hasQuery && totalShown > 0 ? (
            <div className="search-summary">
              <strong>
                {totalShown.toLocaleString("en-IN")} top match
                {totalShown === 1 ? "" : "es"} for “{query}”
              </strong>
              <span className="muted meta">
                Notices {results.notices.length} · Departments {results.departments.length} ·
                Archive {results.files.length}
              </span>
            </div>
          ) : null}

          {hasQuery && results.notices.length > 0 ? (
            <section className="section" aria-labelledby="search-notices">
              <SectionHeader
                eyebrow="Notices"
                title={`Published notices (${results.notices.length})`}
                id="search-notices"
              />
              <ul className="result-list" style={{ listStyle: "none", padding: 0 }}>
                {results.notices.map((notice) => (
                  <li key={notice.id}>
                    <Link className="result-card" href={`/notices/${notice.id}`}>
                      <span className="result-type" aria-hidden="true">
                        <Megaphone />
                      </span>
                      <span className="result-main">
                        <span className="result-title">
                          <Highlight text={notice.title} query={query} />
                        </span>
                        <span className="result-snippet">
                          <Highlight text={truncate(notice.body, 190)} query={query} />
                        </span>
                        <span className="result-meta">
                          <time dateTime={notice.published_at ?? undefined}>
                            {formatDate(notice.published_at)}
                          </time>
                          {notice.category ? <span>· {notice.category}</span> : null}
                        </span>
                      </span>
                      <span className="result-trailing" aria-hidden="true">
                        <ArrowRight />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasQuery && results.departments.length > 0 ? (
            <section className="section" aria-labelledby="search-departments">
              <SectionHeader
                eyebrow="Departments"
                title={`Department matches (${results.departments.length})`}
                id="search-departments"
              />
              <div className="department-grid">
                {results.departments.map((department) => (
                  <Link
                    className="department-card"
                    key={department.slug}
                    href={`/departments/${department.slug}`}
                  >
                    <span className="department-card-top">
                      <span className="department-code">{department.shortName}</span>
                      <ArrowRight aria-hidden="true" width={16} height={16} className="subtle" />
                    </span>
                    <span className="department-card-title">
                      <Highlight text={department.name} query={query} />
                    </span>
                    <p className="department-card-description">{department.description}</p>
                    <span className="department-card-foot">
                      <span>
                        {department.resourceCount.toLocaleString("en-IN")} resources
                      </span>
                      <span>
                        {formatDate(department.latestUpdate, { fallback: "No archive yet" })}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {hasQuery && results.files.length > 0 ? (
            <section className="section" aria-labelledby="search-files">
              <SectionHeader
                eyebrow="Archive"
                title={`Archive resources (${results.files.length})`}
                id="search-files"
                description="Matching files from the verified migrated archive."
              />
              <ul className="result-list" style={{ listStyle: "none", padding: 0 }}>
                {results.files.map((file) => {
                  const meaningfulPath = getMeaningfulLegacyPath(
                    file.legacy_relative_path,
                    file.legacy_department,
                  );
                  return (
                    <li key={file.id}>
                      <Link
                        className="result-card"
                        href={`/departments/${file.legacy_department}/file/${file.id}`}
                      >
                        <span className="result-type" aria-hidden="true">
                          <FileIcon name={file.original_name} mimeType={file.mime_type} />
                        </span>
                        <span className="result-main">
                          <span className="result-title">
                            <Highlight text={file.original_name} query={query} />
                          </span>
                          {meaningfulPath ? (
                            <span className="result-snippet">{meaningfulPath}</span>
                          ) : null}
                          <span className="result-meta">
                            <span className="file-row-type">
                              {fileTypeLabel(file.original_name, file.mime_type)}
                            </span>
                            <span>{formatBytes(file.size_bytes)}</span>
                            <span>· {formatDate(file.created_at)}</span>
                          </span>
                        </span>
                        <span className="result-trailing" aria-hidden="true">
                          <ArrowRight />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {!hasQuery ? (
            <section className="section" aria-labelledby="search-no-query">
              <SectionHeader
                eyebrow="How it works"
                title="Three places are searched at once"
                id="search-no-query"
                description="One query runs against every public surface, so a single search is enough."
              />
              <div className="admin-grid-3">
                <div className="card">
                  <h3 className="card-title">Published notices</h3>
                  <p className="card-subtitle">
                    Titles, bodies, departments and categories of every notice currently
                    visible to the public.
                  </p>
                </div>
                <div className="card">
                  <h3 className="card-title">Departments</h3>
                  <p className="card-subtitle">
                    Names, codes and descriptions from the college directory.
                  </p>
                </div>
                <div className="card">
                  <h3 className="card-title">Archive resources</h3>
                  <p className="card-subtitle">
                    File names and legacy paths across the migrated archive. Drafts and
                    quarantined files are never returned.
                  </p>
                </div>
              </div>
              <div className="quick-access" style={{ marginTop: "var(--space-4)" }}>
                <Link className="quick-access-item" href="/archive">
                  <span className="quick-access-icon" aria-hidden="true">
                    <FileStack />
                  </span>
                  <span className="quick-access-text">
                    <span className="quick-access-title">Prefer to browse?</span>
                    <span className="quick-access-hint">
                      Open the archive and navigate by department and folder
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
