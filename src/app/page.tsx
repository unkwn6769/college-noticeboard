import Link from "next/link";
import { ArrowRight, Building2, FileStack, Megaphone, Search } from "lucide-react";

import PublicNav from "@/src/components/PublicNav";
import PublicFooter from "@/src/components/PublicFooter";
import DepartmentCard from "@/src/components/DepartmentCard";
import SectionHeader from "@/src/components/SectionHeader";
import NoticeCard, { type NoticeCardData } from "@/src/components/NoticeCard";
import FileIcon from "@/src/components/FileIcon";
import EmptyState from "@/src/components/EmptyState";
import { listRecentArchiveFiles } from "@/src/lib/archive";
import { listPublishedNotices, countPublishedNotices } from "@/src/lib/notices";
import { listDepartmentStats, type DepartmentStats } from "@/src/lib/departments";
import { getMeaningfulLegacyPath } from "@/src/lib/file-search";
import { departmentLabel, fileTypeLabel, formatBytes, formatDate } from "@/src/lib/format";

export const dynamic = "force-dynamic";

const QUICK_ACCESS = [
  {
    href: "/departments",
    icon: Building2,
    title: "All departments",
    hint: "Browse every department in the directory",
  },
  {
    href: "/departments/exams-noticeboard",
    icon: Megaphone,
    title: "Examinations",
    hint: "Schedules, results and academic notices",
  },
  {
    href: "/archive",
    icon: FileStack,
    title: "College archive",
    hint: "Browse the full document archive by folder",
  },
  {
    href: "/search",
    icon: Search,
    title: "Search the portal",
    hint: "Notices, departments and resources at once",
  },
] as const;

function asCardData(notice: {
  id: string;
  title: string;
  body: string;
  category: string | null;
  department: string | null;
  is_pinned: boolean;
  published_at: string | null;
}): NoticeCardData {
  return notice;
}

export default async function HomePage() {
  const [notices, noticeCount, examinationNotices, generalNotices, departments, recentResources] =
    await Promise.all([
      listPublishedNotices("", 6),
      countPublishedNotices(),
      listPublishedNotices("", 4, { department: "exams-noticeboard" }),
      listPublishedNotices("", 4, { department: "gen-noticeboard" }),
      listDepartmentStats(),
      listRecentArchiveFiles(8),
    ]);

  const totalResources = departments.reduce(
    (sum, department) => sum + department.resourceCount,
    0,
  );
  const latestResource = departments.reduce<string | null>((latest, department) => {
    if (!department.latestUpdate) return latest;
    if (!latest) return department.latestUpdate;
    return new Date(department.latestUpdate) > new Date(latest)
      ? department.latestUpdate
      : latest;
  }, null);

  const pinned = notices.filter((notice) => notice.is_pinned);
  const [lead, ...rest] = pinned.length > 0 ? [...pinned, ...notices.filter((n) => !n.is_pinned)] : notices;

  return (
    <>
      <PublicNav />
      <main className="page" id="main-content">
        <section className="hero">
          <div className="container hero-inner">
            <div className="hero-grid">
              <div>
                <p className="hero-pill">
                  <span className="hero-pill-dot" aria-hidden="true" />
                  Noticeboard online
                </p>
                <h1 className="hero-title">
                  College notices,
                  <br />
                  <span>in one place.</span>
                </h1>
                <p className="hero-lead">
                  Official announcements, examination updates and departmental
                  resources, published from a single self-hosted noticeboard.
                </p>

                <form className="hero-search" action="/search" method="get" role="search">
                  <label className="sr-only" htmlFor="home-search">
                    Search notices, departments and archive resources
                  </label>
                  <input
                    id="home-search"
                    className="input"
                    name="q"
                    type="search"
                    maxLength={100}
                    placeholder="Search notices, departments and resources…"
                    autoComplete="off"
                  />
                  <button className="btn" type="submit">
                    <Search aria-hidden="true" />
                    Search
                  </button>
                </form>
              </div>

              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="hero-stat-label">
                    <Megaphone aria-hidden="true" />
                    Published notices
                  </span>
                  <span className="hero-stat-value">
                    {noticeCount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">
                    <Building2 aria-hidden="true" />
                    Departments
                  </span>
                  <span className="hero-stat-value">{departments.length}</span>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">
                    <FileStack aria-hidden="true" />
                    Archive resources
                  </span>
                  <span className="hero-stat-value">
                    {totalResources.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">
                    <Search aria-hidden="true" />
                    Latest archive update
                  </span>
                  <span className="hero-stat-value hero-stat-value-sm">
                    {formatDate(latestResource, { fallback: "No updates yet" })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <section className="section" id="notices" aria-labelledby="latest-notices-title">
            <SectionHeader
              eyebrow="Updates"
              title="Latest & important notices"
              id="latest-notices-title"
              description="Published official notices, with important items shown first."
              action={
                <Link className="link-arrow" href="/search">
                  Search all notices
                  <ArrowRight aria-hidden="true" />
                </Link>
              }
            />

            {notices.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No published notices yet"
                description="Nothing has been published to the public noticeboard so far. Published notices will appear here as soon as they are released by a department."
              />
            ) : (
              <div className="notice-list">
                {lead ? <NoticeCard notice={asCardData(lead)} featured /> : null}
                {rest.map((notice) => (
                  <NoticeCard key={notice.id} notice={asCardData(notice)} excerpt={false} />
                ))}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="featured-departments-title">
            <SectionHeader
              eyebrow="By department"
              title="Examinations & general"
              id="featured-departments-title"
              description="The two departments that publish the broadest announcements."
            />
            <div className="feature-grid">
              <DepartmentNoticePanel
                title="Examinations"
                description="Examination schedules, results and academic instructions published by the examinations unit."
                href="/departments/exams-noticeboard"
                notices={examinationNotices}
              />
              <DepartmentNoticePanel
                title="General notices"
                description="Announcements intended for the wider college community."
                href="/departments/gen-noticeboard"
                notices={generalNotices}
              />
            </div>
          </section>

          <section className="section" id="departments" aria-labelledby="departments-title">
            <SectionHeader
              eyebrow="Directory"
              title="Departments"
              id="departments-title"
              description="Choose a department to explore its notices and archive."
              action={
                <Link className="link-arrow" href="/departments">
                  Full directory
                  <ArrowRight aria-hidden="true" />
                </Link>
              }
            />
            {departments.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No departments registered"
                description="The department registry is empty, so there is nothing to browse yet."
              />
            ) : (
              <div className="department-grid">
                {departments.map((department) => (
                  <DepartmentCard
                    key={department.slug}
                    department={department}
                    hrefBase="/departments"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="recent-resources-title">
            <SectionHeader
              eyebrow="Archive"
              title="Recently added resources"
              id="recent-resources-title"
              description="The newest files in the active migrated archive."
              action={
                <Link className="link-arrow" href="/archive">
                  Browse the archive
                  <ArrowRight aria-hidden="true" />
                </Link>
              }
            />

            {recentResources.length === 0 ? (
              <EmptyState
                icon={FileStack}
                title="No archive resources available"
                description="The active archive does not contain any migrated resources yet. New resources will appear here as they are imported."
              />
            ) : (
              <ul className="resource-list" style={{ listStyle: "none", padding: 0 }}>
                {recentResources.map((resource) => {
                  const department = getDepartmentName(
                    resource.legacy_department,
                    departments,
                  );
                  const visiblePath = getMeaningfulLegacyPath(
                    resource.legacy_relative_path,
                    resource.legacy_department,
                  );
                  const href = resource.legacy_department
                    ? `/departments/${resource.legacy_department}/file/${resource.id}`
                    : "/archive";

                  return (
                    <li key={resource.id}>
                      <Link className="resource-row" href={href}>
                        <span className="resource-icon" aria-hidden="true">
                          <FileIcon
                            name={resource.original_name}
                            mimeType={resource.mime_type}
                          />
                        </span>
                        <span className="resource-main">
                          <span className="resource-name" title={resource.original_name}>
                            {resource.original_name}
                          </span>
                          <span className="resource-sub" title={visiblePath ?? undefined}>
                            {visiblePath || resource.original_name}
                          </span>
                          <span className="resource-sub">
                            {department ?? "Archive"} · Added {formatDate(resource.created_at)}
                          </span>
                        </span>
                        <span className="resource-size">
                          <span className="file-row-type">
                            {fileTypeLabel(resource.original_name, resource.mime_type)}
                          </span>{" "}
                          {formatBytes(resource.size_bytes)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="section" aria-labelledby="quick-access-title">
            <SectionHeader
              eyebrow="Shortcuts"
              title="Quick access"
              id="quick-access-title"
              description="The four places visitors usually want to go next."
            />
            <div className="quick-access">
              {QUICK_ACCESS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link className="quick-access-item" key={item.href} href={item.href}>
                    <span className="quick-access-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="quick-access-text">
                      <span className="quick-access-title">{item.title}</span>
                      <span className="quick-access-hint">{item.hint}</span>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

function getDepartmentName(
  department: string | null,
  departments: DepartmentStats[],
) {
  if (!department) return null;
  return (
    departments.find((item) => item.slug === department)?.name ??
    departmentLabel(department)
  );
}

function DepartmentNoticePanel({
  title,
  description,
  href,
  notices,
}: {
  title: string;
  description: string;
  href: string;
  notices: Array<{
    id: string;
    title: string;
    body: string;
    category: string | null;
    department: string | null;
    is_pinned: boolean;
    published_at: string | null;
  }>;
}) {
  return (
    <article className="card feature-panel">
      <div className="card-header">
        <div>
          <h3 className="card-title">{title}</h3>
          <p className="card-subtitle">{description}</p>
        </div>
        <Link className="link-arrow" href={href}>
          Open
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>

      {notices.length === 0 ? (
        <EmptyState
          compact
          icon={Megaphone}
          title={`No ${title.toLowerCase()} yet`}
          description="Nothing has been published in this department so far."
        />
      ) : (
        <div className="feature-panel-body">
          {notices.map((notice) => (
            <Link
              className="related-item"
              key={notice.id}
              href={`/notices/${notice.id}`}
            >
              <span>
                <span className="related-title">{notice.title}</span>
                <span className="related-date" style={{ display: "block" }}>
                  {formatDate(notice.published_at)}
                </span>
              </span>
              <ArrowRight aria-hidden="true" width={16} height={16} />
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
