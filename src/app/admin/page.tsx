import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileStack,
  HardDrive,
  Megaphone,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import { getDashboardSnapshot } from "@/src/lib/dashboard";
import { auditEvent } from "@/src/lib/status";
import { formatBytes, formatCount, formatDateTime, formatRelativeTime } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const QUICK_ACTIONS = [
  {
    href: "/admin/notices/new",
    icon: Megaphone,
    title: "Create a notice",
    hint: "Draft first, publish when ready",
  },
  {
    href: "/admin/files",
    icon: Upload,
    title: "Upload a file",
    hint: "Streamed to storage with checksum",
  },
  {
    href: "/admin/integrity",
    icon: ShieldCheck,
    title: "Run an integrity check",
    hint: "Compare records against storage",
  },
  {
    href: "/admin/scanner",
    icon: ScanLine,
    title: "Scan the legacy source",
    hint: "Preview before importing anything",
  },
] as const;

export default async function AdminPage() {
  const snapshot = await getDashboardSnapshot();
  const { storage, notices, files, users } = snapshot;

  const attention: Array<{ label: string; detail: string; href: string }> = [];
  if (storage.pressure !== "NORMAL") {
    attention.push({
      label: `Storage pressure is ${storage.pressure.toLowerCase()}`,
      detail: `${storage.usagePercent.toFixed(1)}% of the storage volume is in use.`,
      href: "/admin/storage",
    });
  }
  if (!storage.writable) {
    attention.push({
      label: "The storage volume is not writable",
      detail: "Uploads and publications will fail until this is resolved.",
      href: "/admin/storage",
    });
  }
  if (files.quarantined > 0) {
    attention.push({
      label: `${formatCount(files.quarantined)} file${files.quarantined === 1 ? " is" : "s are"} quarantined`,
      detail: "Quarantined files stay recoverable until they are purged.",
      href: "/admin/recycle-bin",
    });
  }
  if (snapshot.pendingCleanup > 0) {
    attention.push({
      label: `${snapshot.pendingCleanup} cleanup operation${snapshot.pendingCleanup === 1 ? " is" : "s are"} pending`,
      detail: "A queued cleanup has not completed yet.",
      href: "/admin/storage",
    });
  }
  if (snapshot.orphanedFileRows > 0 || snapshot.attachmentsNotActive > 0) {
    attention.push({
      label: "Referential inconsistencies detected",
      detail: `${snapshot.orphanedFileRows} broken version reference(s), ${snapshot.attachmentsNotActive} attachment(s) pointing at a non-active file.`,
      href: "/admin/integrity",
    });
  }
  if (notices.draft > 0) {
    attention.push({
      label: `${notices.draft} draft notice${notices.draft === 1 ? "" : "s"} waiting`,
      detail: "Drafts are invisible to the public until they are published.",
      href: "/admin/notices",
    });
  }

  const health = attention.length === 0;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="What is healthy, what needs attention, what happened recently, and what to do next."
        actions={
          <>
            <Link className="btn" href="/admin/notices/new">
              <Megaphone aria-hidden="true" />
              New notice
            </Link>
            <Link className="btn btn-secondary" href="/admin/files">
              <FileStack aria-hidden="true" />
              Files
            </Link>
          </>
        }
      />

      <section aria-labelledby="kpi-title">
        <h2 className="sr-only" id="kpi-title">
          Key counts
        </h2>
        <div className="metric-grid">
          <div className="metric">
            <span className="metric-label">
              <Megaphone aria-hidden="true" />
              Published notices
            </span>
            <span className="metric-value">{formatCount(notices.published)}</span>
            <span className="metric-hint">
              {notices.draft} draft · {notices.archived} archived
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">
              <FileStack aria-hidden="true" />
              Active files
            </span>
            <span className="metric-value">{formatCount(files.active)}</span>
            <span className="metric-hint">
              {formatCount(files.quarantined)} quarantined · {formatCount(files.total)} total
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">
              <Users aria-hidden="true" />
              Active users
            </span>
            <span className="metric-value">{formatCount(users.active)}</span>
            <span className="metric-hint">
              {formatCount(users.disabled)} disabled of {formatCount(users.total)}
            </span>
          </div>
          <div
            className={`metric${storage.pressure === "NORMAL" ? " metric-accent-success" : storage.pressure === "WARNING" ? " metric-accent-warning" : " metric-accent-danger"}`}
          >
            <span className="metric-label">
              <HardDrive aria-hidden="true" />
              Storage volume
            </span>
            <span className="metric-value">{storage.usagePercent.toFixed(1)}%</span>
            <span className="meter" aria-hidden="true">
              <span
                className={`meter-fill${storage.pressure === "NORMAL" ? " meter-fill-success" : storage.pressure === "WARNING" ? " meter-fill-warning" : " meter-fill-danger"}`}
                style={{ width: `${Math.min(100, storage.usagePercent)}%` }}
              />
            </span>
            <span className="metric-hint">
              {formatBytes(storage.freeBytes, { fallback: "unknown" })} free of{" "}
              {formatBytes(storage.totalBytes, { fallback: "unknown" })} ·{" "}
              {storage.pressure.toLowerCase()}
            </span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="attention-title">
        <h2 className="section-title" id="attention-title" style={{ marginBottom: 12 }}>
          Needs attention
        </h2>

        {health ? (
          <div className="status-banner status-banner-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <p className="status-banner-title">Everything is healthy</p>
              <p className="status-banner-text">
                No quarantined files, no pending cleanup, no storage pressure and no
                drafts waiting. Nothing requires action right now.
              </p>
            </div>
          </div>
        ) : (
          <ul className="stack stack-2" style={{ listStyle: "none", padding: 0 }}>
            {attention.map((item) => (
              <li key={item.label}>
                <Link
                  className="status-banner status-banner-warning"
                  href={item.href}
                  style={{ textDecoration: "none" }}
                >
                  <AlertTriangle aria-hidden="true" />
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <p className="status-banner-title">{item.label}</p>
                    <p className="status-banner-text">{item.detail}</p>
                  </div>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="activity-title">
        <h2 className="section-title" id="activity-title" style={{ marginBottom: 12 }}>
          Recent activity
        </h2>
        {snapshot.recentActivity.length === 0 ? (
          <EmptyState
            compact
            icon={Activity}
            title="No recorded activity yet"
            description="Administrative actions are written to the append-only audit log. Nothing has been recorded so far."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Resource</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentActivity.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <StatusBadge descriptor={auditEvent(event.event_type)} dot />
                    </td>
                    <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                      {event.actor_name ?? "System"}
                    </td>
                    <td className="muted mono" style={{ fontSize: "var(--text-3xs)" }}>
                      {event.entity_type ? `${event.entity_type} ` : ""}
                      {event.entity_id ? `${event.entity_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td
                      className="muted nowrap"
                      style={{ textAlign: "right", fontSize: "var(--text-2xs)" }}
                    >
                      <time dateTime={event.created_at} title={formatDateTime(event.created_at)}>
                        {formatRelativeTime(event.created_at)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="actions" style={{ marginTop: 12 }}>
          <Link className="btn btn-ghost btn-sm" href="/admin/audit">
            Open the full audit log
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="actions-title">
        <h2 className="section-title" id="actions-title" style={{ marginBottom: 12 }}>
          Quick actions
        </h2>
        <div className="quick-access">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link className="quick-access-item" key={action.href} href={action.href}>
                <span className="quick-access-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="quick-access-text">
                  <span className="quick-access-title">{action.title}</span>
                  <span className="quick-access-hint">{action.hint}</span>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="context-title">
        <h2 className="section-title" id="context-title" style={{ marginBottom: 12 }}>
          Content context
        </h2>
        <div className="admin-grid-2">
          <div className="admin-section">
            <p className="metric-label">Latest published notice</p>
            {snapshot.latestNotice ? (
              <>
                <p className="card-title" style={{ marginTop: 6, fontSize: "var(--text-base)" }}>
                  {snapshot.latestNotice.title}
                </p>
                <p className="metric-hint">
                  Published {formatDateTime(snapshot.latestNotice.published_at)}
                </p>
              </>
            ) : (
              <p className="metric-hint" style={{ marginTop: 6 }}>
                Nothing has been published to the public noticeboard yet.
              </p>
            )}
            <div className="actions" style={{ marginTop: 12 }}>
              <Link className="btn btn-secondary btn-sm" href="/admin/notices">
                Manage notices
              </Link>
            </div>
          </div>

          <div className="admin-section">
            <p className="metric-label">Newest archived file</p>
            <p className="card-title" style={{ marginTop: 6, fontSize: "var(--text-base)" }}>
              {snapshot.latestFileAt
                ? formatDateTime(snapshot.latestFileAt)
                : "No active files"}
            </p>
            <p className="metric-hint">
              {formatCount(files.active)} active · {formatCount(files.staging)} in staging
            </p>
            <div className="actions" style={{ marginTop: 12 }}>
              <Link className="btn btn-secondary btn-sm" href="/admin/files">
                Open files
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
