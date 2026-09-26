"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Info,
  Play,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import ErrorState from "@/src/components/ErrorState";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { SkeletonRegion, SkeletonMetrics, SkeletonTable } from "@/src/components/Skeleton";
import { severity } from "@/src/lib/status";
import { formatCount } from "@/src/lib/format";

type IntegrityIssue = {
  type: string;
  severity: "error" | "warning" | "info";
  fileId?: string;
  storageKey?: string;
  originalName?: string;
  detail: string;
};

type Summary = {
  totalActiveFiles: number;
  missingStorageObjects: number;
  sizeMismatches: number;
  checksumErrors: number;
  checksumVerified: number;
  checksumSkipped: number;
  orphanedObjects: number;
  staleStaging: number;
  duplicateContent: number;
  brokenVersionRefs: number;
  badAttachments: number;
  issueCount: number;
  healthy: boolean;
  checksumMode: string;
};

const FILTERS = ["all", "error", "warning", "info"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export default function IntegrityPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [issues, setIssues] = useState<IntegrityIssue[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [withChecksums, setWithChecksums] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  async function runCheck() {
    setRunning(true);
    setError("");
    setHasRun(true);
    setSummary(null);
    setIssues([]);

    try {
      const url = `/api/admin/integrity${withChecksums ? "?checksums=true" : ""}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "The integrity check could not be completed.");
      }
      const payload = await response.json();
      setSummary(payload.summary);
      setIssues(Array.isArray(payload.issues) ? payload.issues : []);
      setFilter("all");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The integrity check could not be completed.",
      );
    } finally {
      setRunning(false);
    }
  }

  const filtered = issues.filter((issue) => filter === "all" || issue.severity === filter);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const infos = issues.filter((issue) => issue.severity === "info").length;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Integrity" }]} />
        }
        eyebrow="Operations"
        title="Archive integrity"
        description="Reconcile database records against the bytes actually present in storage. Nothing is changed by a check."
        actions={
          <button className="btn" type="button" onClick={() => void runCheck()} disabled={running}>
            {running ? <span className="spinner" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {running ? "Scanning…" : hasRun ? "Run again" : "Run check"}
          </button>
        }
      />

      {error ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <ErrorState
            title="The integrity check could not be completed"
            message={error}
            onRetry={() => void runCheck()}
          />
        </div>
      ) : null}

      <section className="form-section" aria-label="Integrity check options">
        <div className="admin-section-head">
          <div>
            <h2 className="form-section-heading">Check options</h2>
            <p className="form-section-desc">
              A quick scan compares record counts, sizes and object existence and finishes
              quickly. A full checksum scan additionally reads every byte from disk and can
              take minutes on a large archive.
            </p>
          </div>
        </div>
        <label className="checkbox-field" htmlFor="integrity-checksums">
          <input
            id="integrity-checksums"
            type="checkbox"
            checked={withChecksums}
            disabled={running}
            onChange={(event) => setWithChecksums(event.target.checked)}
          />
          <span>
            <span className="checkbox-field-text">
              <Fingerprint aria-hidden="true" style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px" }} />{" "}
              Verify SHA-256 checksums
            </span>
            <span className="checkbox-field-hint">
              Slower: reads all file bytes and recomputes every digest.
            </span>
          </span>
        </label>
      </section>

      {running ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <SkeletonRegion label="Scanning the archive for integrity issues.">
            <SkeletonMetrics count={6} />
            <div style={{ marginTop: "var(--space-5)" }}>
              <SkeletonTable rows={5} columns={4} />
            </div>
          </SkeletonRegion>
        </div>
      ) : null}

      {summary ? (
        <>
          <section
            className={`status-banner ${summary.healthy ? "status-banner-success" : "status-banner-danger"}`}
            style={{ marginTop: "var(--space-5)" }}
            role="status"
          >
            {summary.healthy ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <ShieldAlert aria-hidden="true" />
            )}
            <div>
              <p className="status-banner-title">
                {summary.healthy
                  ? "No errors detected"
                  : `${errors} error${errors === 1 ? "" : "s"} detected`}
              </p>
              <p className="status-banner-text">
                {summary.issueCount} issue{summary.issueCount === 1 ? "" : "s"} in total
                {summary.checksumMode === "skipped"
                  ? " (checksums were not verified in this run)"
                  : ` (${formatCount(summary.checksumVerified)} checksum${summary.checksumVerified === 1 ? "" : "s"} verified, ${formatCount(summary.checksumSkipped)} skipped)`}
                . A clean run means every active record has matching bytes.
              </p>
            </div>
          </section>

          <section className="metric-grid" style={{ marginTop: "var(--space-5)" }} aria-label="Integrity counters">
            <div className="metric">
              <span className="metric-label">Active files</span>
              <span className="metric-value">{formatCount(summary.totalActiveFiles)}</span>
              <span className="metric-hint">Records expected to have bytes on disk</span>
            </div>
            <Metric
              label="Missing objects"
              value={summary.missingStorageObjects}
              hint="A record exists but its bytes are gone"
            />
            <Metric
              label="Size mismatches"
              value={summary.sizeMismatches}
              hint="Stored size differs from the record"
            />
            <Metric
              label="Checksum errors"
              value={summary.checksumErrors}
              hint={
                summary.checksumMode === "skipped"
                  ? "Not checked in this run"
                  : "Digest does not match the record"
              }
            />
            <Metric
              label="Orphaned objects"
              value={summary.orphanedObjects}
              hint="Bytes on disk with no record"
            />
            <Metric
              label="Stale staging"
              value={summary.staleStaging}
              hint="Partial uploads left behind"
            />
          </section>

          {summary.issueCount === 0 ? (
            <div style={{ marginTop: "var(--space-5)" }}>
              <EmptyState
                icon={ShieldCheck}
                title="All checks passed"
                description={`Every one of the ${formatCount(summary.totalActiveFiles)} active file records has matching bytes in storage.${
                  summary.checksumMode === "skipped"
                    ? " Checksums were not verified in this run."
                    : ""
                }`}
              />
            </div>
          ) : (
            <section className="section" aria-labelledby="anomaly-title">
              <div className="section-header">
                <div>
                  <h2 className="section-title" id="anomaly-title">
                    Anomalies
                  </h2>
                  <p className="section-description">
                    Anomalies are reported, never silently destroyed. Review each one before
                    taking any action.
                  </p>
                </div>
                <div className="tabs" role="group" aria-label="Filter anomalies by severity">
                  {FILTERS.map((option) => {
                    const count =
                      option === "all"
                        ? issues.length
                        : option === "error"
                          ? errors
                          : option === "warning"
                            ? warnings
                            : infos;
                    return (
                      <button
                        key={option}
                        type="button"
                        className="tab"
                        aria-pressed={filter === option}
                        onClick={() => setFilter(option)}
                      >
                        {FILTER_LABEL[option]}
                        <span className="tab-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  compact
                  icon={Info}
                  title={`No ${filter === "all" ? "" : FILTER_LABEL[filter].toLowerCase() + " "}anomalies`}
                  description={
                    filter === "all"
                      ? "The check reported no anomalies."
                      : `The check found ${issues.length} anomal${issues.length === 1 ? "y" : "ies"} in total, but none with ${FILTER_LABEL[filter].toLowerCase()} severity.`
                  }
                />
              ) : (
                <>
                  <div className="table-wrap show-desktop" tabIndex={0} role="region" aria-label="Integrity issues table">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Severity</th>
                          <th scope="col">Type</th>
                          <th scope="col">File</th>
                          <th scope="col">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((issue, index) => (
                          <tr key={`${issue.type}-${issue.fileId ?? "row"}-${index}`}>
                            <td>
                              <StatusBadge descriptor={severity(issue.severity)} dot />
                            </td>
                            <td className="mono">{issue.type}</td>
                            <td>
                              {issue.originalName ? (
                                <div className="cell-primary" style={{ overflowWrap: "anywhere" }}>
                                  {issue.originalName}
                                </div>
                              ) : null}
                              {issue.fileId ? (
                                <div className="cell-sub mono">{issue.fileId}</div>
                              ) : null}
                              {!issue.originalName && !issue.fileId ? (
                                <span className="muted">—</span>
                              ) : null}
                            </td>
                            <td className="muted" style={{ fontSize: "var(--text-xs)" }}>
                              {issue.detail}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="data-list show-mobile" style={{ listStyle: "none", padding: 0 }}>
                    {filtered.map((issue, index) => (
                      <li
                        className="data-list-item"
                        key={`${issue.type}-${issue.fileId ?? "row"}-${index}`}
                      >
                        <div className="data-list-head">
                          <span className="data-list-title mono">{issue.type}</span>
                          <StatusBadge descriptor={severity(issue.severity)} dot />
                        </div>
                        <p className="cell-sub" style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
                          {issue.detail}
                        </p>
                        {issue.originalName || issue.fileId ? (
                          <dl className="data-list-meta">
                            {issue.originalName ? (
                              <div>
                                <dt>File</dt>
                                <dd>{issue.originalName}</dd>
                              </div>
                            ) : null}
                            {issue.fileId ? (
                              <div>
                                <dt>File ID</dt>
                                <dd className="mono">{issue.fileId}</dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      ) : null}

      {!running && !summary && !error ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <EmptyState
            icon={AlertTriangle}
            title="No integrity check has been run yet"
            description="A check reads storage and the database to find missing objects, size mismatches, checksum errors, orphaned bytes and broken references. Nothing is modified, so it is safe to run whenever you need a current picture."
            actions={
              <button className="btn" type="button" onClick={() => void runCheck()}>
                <Play aria-hidden="true" />
                Run the quick check
              </button>
            }
          />
        </div>
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  const accent = value > 0 ? " metric-accent-danger" : " metric-accent-success";
  return (
    <div className={`metric${accent}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{formatCount(value)}</span>
      <span className="metric-hint">{hint}</span>
    </div>
  );
}
