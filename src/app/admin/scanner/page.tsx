"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleDashed,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  Fingerprint,
  Play,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import ErrorState from "@/src/components/ErrorState";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { SkeletonRegion, SkeletonText } from "@/src/components/Skeleton";
import { useConfirm } from "@/src/components/ConfirmDialog";
import { useToast } from "@/src/components/Toast";
import { humanise, scannerOutcome, scannerRunOutcome } from "@/src/lib/status";
import { formatBytes, formatDateTime, formatRelativeTime } from "@/src/lib/format";

type Run = {
  id: string;
  mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  heartbeat_at: string;
  total_count: number;
  processed_count: number;
  last_processed_path: string | null;
  discovered_count: number;
  new_count: number;
  changed_count: number;
  missing_count: number;
  unchanged_count: number;
  imported_count: number;
  failed_count: number;
  skipped_count: number;
  error_message: string | null;
};

type Preview = {
  fingerprint: string;
  generatedAt: string;
  expiresAt: string;
  approvalToken: string;
  counts: {
    discovered: number;
    new: number;
    changed: number;
    duplicate: number;
    invalid: number;
    failed: number;
    missing: number;
  };
  discoveryFailures: Array<{ relativePathPrefix: string; status: number | null; error: string }>;
  candidates: Array<{
    relativePath: string;
    department: string | null;
    sizeBytes: number;
    outcome: string;
    error: string | null;
  }>;
};

type Data = {
  runs: Run[];
  failures: Array<{
    id: string;
    legacy_relative_path: string;
    error_message: string;
    updated_at: string;
  }>;
};

const WORKFLOW = ["Preview", "Review", "Approve", "Import", "Result", "Recover"] as const;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const message = body?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function ScannerPage() {
  const confirm = useConfirm();
  const { toast } = useToast();

  const [data, setData] = useState<Data | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (id = runId) => {
      try {
        const response = await fetch(
          `/api/admin/scanner${id ? `?runId=${encodeURIComponent(id)}` : ""}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(await readError(response, "The scanner status could not be loaded."));
        }
        setData(await response.json());
        setError("");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The scanner status could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function runPreview() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/scanner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "PREVIEW" }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "The preview could not be generated."));
      }
      setPreview(await response.json());
      toast({ tone: "success", title: "Preview ready", text: "Review it before importing." });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The preview could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function start(mode: "DRY_RUN" | "IMPORT") {
    if (mode === "IMPORT") {
      if (!preview) {
        setError("Run and review a preview before importing.");
        return;
      }
      const ok = await confirm({
        title: "Import this preview into the live archive?",
        subject: `${preview.counts.new} new and ${preview.counts.changed} changed resource(s)`,
        consequence:
          "Approved candidates are written to active storage and become publicly visible. The approval token expires, so this exact preview can be imported only once.",
        confirmLabel: "Approve and import",
        tone: "warning",
      });
      if (!ok) return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/scanner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          ...(mode === "IMPORT" ? { approvalToken: preview?.approvalToken } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "The scanner could not be started."));
      }
      const body = await response.json();
      setRunId(body.runId);
      setPreview(null);
      toast({
        tone: "success",
        title: mode === "IMPORT" ? "Import started" : "Dry run started",
      });
      await load(body.runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The scanner could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/scanner/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "The retry request failed."));
      }
      toast({
        tone: "success",
        title: "Retry requested",
        text: "The item status updates on the next refresh.",
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The retry request failed.");
    } finally {
      setBusy(false);
    }
  }

  const run = data?.runs?.[0] ?? null;
  const expired = preview ? new Date(preview.expiresAt).getTime() < Date.now() : false;
  const processed = run ? Math.min(run.processed_count, run.total_count || run.discovered_count) : 0;
  const total = run ? run.total_count || run.discovered_count : 0;
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

  // A run only reaches the result step when it actually finished. A run that
  // ended badly, or whose lease expired, leaves the operator in Recovery.
  const stageIndex = run
    ? run.status === "SUCCEEDED"
      ? 4
      : run.status === "RUNNING"
        ? 3
        : 5
    : preview
      ? expired
        ? 1
        : 2
      : 0;

  /**
   * A successful run carries an `error_message` when some source locations
   * could not be read. That is a partial failure, not a failed run, so it is
   * reported as a warning; only a run that actually failed gets the danger
   * treatment.
   */
  const runMessage = run?.error_message?.trim() ? run.error_message.trim() : null;
  /** Import is unavailable until a live, unexpired preview exists. */
  const importLocked = !preview || expired;
  const runBanner = !run
    ? null
    : run.status === "FAILED"
      ? { tone: "danger" as const, icon: TriangleAlert, title: "The run failed", text: runMessage ?? "No further detail was recorded." }
      : run.status === "INTERRUPTED"
        ? { tone: "warning" as const, icon: TriangleAlert, title: "The run was interrupted", text: runMessage ?? "The run stopped before finishing." }
        : run.status === "SUCCEEDED" && runMessage
          ? { tone: "warning" as const, icon: TriangleAlert, title: "The run finished with unreadable source locations", text: runMessage }
          : null;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Scanner" }]} />
        }
        eyebrow="Operations"
        title="Legacy scanner"
        description="Read the legacy noticeboard source, preview what would change, then import under an explicit approval. Nothing is written to the live archive without a reviewed preview."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCcw aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <ErrorState
            title="The scanner reported a problem"
            message={error}
            compact
            onRetry={() => void load()}
          />
        </div>
      ) : null}

      <ol className="workflow" aria-label="Scanner workflow">
        {WORKFLOW.map((step, index) => (
          <li
            key={step}
            className="workflow-step"
            data-state={index < stageIndex ? "done" : index === stageIndex ? "active" : "pending"}
            aria-current={index === stageIndex ? "step" : undefined}
          >
            {step}
          </li>
        ))}
      </ol>

      {/* Stage 1 — Preview ------------------------------------------------ */}
      <section className="stage" style={{ marginTop: "var(--space-4)" }} aria-labelledby="stage-preview">
        <div className="stage-header">
          <div>
            <h2 className="stage-title" id="stage-preview">
              <Eye aria-hidden="true" />
              1 · Preview the source
            </h2>
            <p className="admin-section-desc" style={{ marginTop: 4 }}>
              A read-only scan. It walks the legacy source and classifies every candidate
              without writing anything.
            </p>
          </div>
          <div className="stage-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void runPreview()}
            >
              {busy ? <span className="spinner" aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}
              Generate preview
            </button>
          </div>
        </div>

        {loading && !data ? (
          <SkeletonRegion label="Loading scanner status.">
            <SkeletonText lines={3} />
          </SkeletonRegion>
        ) : preview ? (
          <>
            <div className={`status-banner ${expired ? "status-banner-warning" : "status-banner-info"}`}>
              {expired ? <Clock aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              <div>
                <p className="status-banner-title">
                  {expired ? "This approval has expired" : "Preview ready for review"}
                </p>
                <p className="status-banner-text">
                  {expired
                    ? "Approval expired, so it can no longer be imported. Generate a fresh preview to continue."
                    : `Expires ${formatDateTime(preview.expiresAt)} (${formatRelativeTime(preview.expiresAt, new Date(Date.now() + 60_000))}).`}
                </p>
              </div>
            </div>

            <dl className="metric-grid" style={{ marginTop: "var(--space-4)" }}>
              <Metric label="Candidates" value={preview.counts.discovered} />
              <Metric label="New" value={preview.counts.new} tone="info" />
              <Metric label="Changed" value={preview.counts.changed} tone="warning" />
              <Metric label="Duplicate" value={preview.counts.duplicate} />
              <Metric label="Invalid" value={preview.counts.invalid} tone="warning" />
              <Metric label="Failed" value={preview.counts.failed} tone="danger" />
              <Metric label="Missing" value={preview.counts.missing} tone="warning" />
            </dl>

            <div className="fingerprint" style={{ marginTop: "var(--space-4)" }}>
              <Fingerprint aria-hidden="true" width={13} height={13} />
              <span>Approval fingerprint: {preview.fingerprint}</span>
            </div>

            {preview.candidates.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: "var(--space-4)" }} tabIndex={0} role="region" aria-label="Scanner candidates table">
                <table className="data-table">
                  <caption>
                    {preview.candidates.length} candidate
                    {preview.candidates.length === 1 ? "" : "s"} in this preview
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Outcome</th>
                      <th scope="col">Legacy path</th>
                      <th scope="col">Department</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Size
                      </th>
                      <th scope="col">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.candidates.slice(0, 100).map((candidate, index) => (
                      <tr key={`${candidate.relativePath}-${index}`}>
                        <td>
                          <StatusBadge descriptor={scannerOutcome(candidate.outcome)} dot />
                        </td>
                        <td className="mono" style={{ overflowWrap: "anywhere" }}>
                          {candidate.relativePath}
                        </td>
                        <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                          {candidate.department?.replace("-noticeboard", "") ?? "—"}
                        </td>
                        <td className="num muted" style={{ fontSize: "var(--text-2xs)" }}>
                          {formatBytes(candidate.sizeBytes)}
                        </td>
                        <td className="muted" style={{ fontSize: "var(--text-2xs)" }}>
                          {candidate.error ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.candidates.length > 100 ? (
                  <p className="state-inline" style={{ border: 0, borderRadius: 0 }}>
                    Showing the first 100 of {preview.candidates.length} candidates.
                  </p>
                ) : null}
              </div>
            ) : (
              <div style={{ marginTop: "var(--space-4)" }}>
                <EmptyState
                  compact
                  icon={CircleDashed}
                  title="No candidates in the preview"
                  description="The scan completed but produced no candidates. Check the source configuration if you expected content."
                />
              </div>
            )}

            {preview.discoveryFailures.length > 0 ? (
              <div className="status-banner status-banner-warning" style={{ marginTop: "var(--space-4)" }}>
                <TriangleAlert aria-hidden="true" />
                <div>
                  <p className="status-banner-title">
                    {preview.discoveryFailures.length} location
                    {preview.discoveryFailures.length === 1 ? "" : "s"} could not be read
                  </p>
                  <p className="status-banner-text">
                    {preview.discoveryFailures
                      .slice(0, 5)
                      .map((failure) => `${failure.relativePathPrefix} (${humanise(String(failure.status ?? "error"))})`)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="meta">
            No preview is loaded. Import stays disabled until a preview has been generated
            and reviewed.
          </p>
        )}
      </section>

      {/* Stage 2 — Import ------------------------------------------------- */}
      <section
        className={`stage${importLocked ? " stage-locked" : ""}`}
        aria-labelledby="stage-import"
        {...(importLocked
          ? // Dimming alone is not a state. `role="group"` + `aria-disabled`
            // is the standard way to tell assistive technology that a group of
            // controls is unavailable, and the reason is announced with it
            // rather than being left in a paragraph next to a disabled button
            // that never receives focus.
            { role: "group" as const, "aria-disabled": true as const, "aria-describedby": "stage-import-state" }
          : {})}
      >
        <div className="stage-header">
          <div>
            <h2 className="stage-title" id="stage-import">
              <Download aria-hidden="true" />
              2 · Run and import
            </h2>
            <p className="admin-section-desc" style={{ marginTop: 4 }}>
              A dry run exercises the same code path without publishing. An import writes the
              approved candidates to active storage.
            </p>
          </div>
          <div className="stage-actions">
            {importLocked ? (
              <span className="badge badge-warning">
                <TriangleAlert aria-hidden="true" />
                Import locked
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void start("DRY_RUN")}
            >
              <Play aria-hidden="true" />
              Start dry run
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || importLocked}
              onClick={() => void start("IMPORT")}
            >
              <Download aria-hidden="true" />
              Approve and import
            </button>
          </div>
        </div>
        {!preview ? (
          <p className="meta" id="stage-import-state">
            Import is locked. Generate a preview first — an import is only ever the exact
            set of candidates you reviewed.
          </p>
        ) : expired ? (
          <p className="meta" id="stage-import-state">
            Import is locked because the approval token has expired.
          </p>
        ) : (
          <p className="meta" id="stage-import-state">
            Importing <strong>{preview.counts.new}</strong> new and{" "}
            <strong>{preview.counts.changed}</strong> changed candidate
            {preview.counts.new + preview.counts.changed === 1 ? "" : "s"}.
          </p>
        )}
      </section>

      {/* Stage 3 — Result ------------------------------------------------- */}
      <section className="stage" aria-labelledby="stage-result">
        <div className="stage-header">
          <div>
            <h2 className="stage-title" id="stage-result">
              <CircleDashed aria-hidden="true" />
              3 · Latest run
            </h2>
          </div>
          {run ? (
            <StatusBadge descriptor={scannerRunOutcome(run)} dot />
          ) : null}
        </div>

        {!run ? (
          <EmptyState
            compact
            icon={CircleDashed}
            title="No scanner run recorded yet"
            description="No scan has been started from this browser. Generate a preview or start a dry run to create the first run record."
          />
        ) : (
          <>
            <div className="progress-bar" aria-hidden="true">
              <div
                className={`progress-bar-fill${run.status === "SUCCEEDED" ? " progress-bar-fill-success" : run.status === "FAILED" ? " progress-bar-fill-danger" : ""}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="progress-legend">
              <span>
                {processed} of {total} processed ({progress}%)
              </span>
              <span>
                {run.mode === "IMPORT" ? "Import" : "Dry run"} · started{" "}
                {formatDateTime(run.started_at)}
              </span>
            </p>

            <dl className="metric-grid" style={{ marginTop: "var(--space-4)" }}>
              <Metric label="Discovered" value={run.discovered_count} />
              <Metric label="Imported" value={run.imported_count} tone="success" />
              <Metric label="Unchanged" value={run.unchanged_count} />
              <Metric label="Skipped" value={run.skipped_count} />
              <Metric label="Failed" value={run.failed_count} tone={run.failed_count > 0 ? "danger" : undefined} />
              <Metric label="Missing at source" value={run.missing_count} tone={run.missing_count > 0 ? "warning" : undefined} />
            </dl>

            {run.last_processed_path ? (
              <p className="meta mono" style={{ marginTop: 12, overflowWrap: "anywhere" }}>
                Last processed: {run.last_processed_path}
              </p>
            ) : null}

            {runBanner ? (
              <div className={`status-banner status-banner-${runBanner.tone}`} style={{ marginTop: "var(--space-4)" }}>
                <runBanner.icon aria-hidden="true" />
                <div>
                  <p className="status-banner-title">{runBanner.title}</p>
                  <p className="status-banner-text">{runBanner.text}</p>
                </div>
              </div>
            ) : null}

            {run.completed_at ? (
              <p className="meta" style={{ marginTop: 12 }}>
                Completed {formatDateTime(run.completed_at)} · last heartbeat{" "}
                {formatRelativeTime(run.heartbeat_at)}
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* Stage 4 — Recovery ----------------------------------------------- */}
      <section className="stage" aria-labelledby="stage-recovery">
        <div className="stage-header">
          <div>
            <h2 className="stage-title" id="stage-recovery">
              <RefreshCcw aria-hidden="true" />
              4 · Recovery
            </h2>
            <p className="admin-section-desc" style={{ marginTop: 4 }}>
              Items that failed during a run stay here until they are retried successfully or
              the source changes.
            </p>
          </div>
          {data?.failures?.length ? (
            <span className="badge badge-danger">{data.failures.length}</span>
          ) : null}
        </div>

        {!data?.failures || data.failures.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title="No failed scanner items"
            description="Nothing is currently stuck. Failed items are listed here with a retry action instead of being silently dropped."
          />
        ) : (
          <ul className="stack stack-2" style={{ listStyle: "none", padding: 0 }}>
            {data.failures.map((failure) => (
              <li className="data-list-item" key={failure.id}>
                <div className="data-list-head">
                  <span className="data-list-title mono" style={{ overflowWrap: "anywhere" }}>
                    {failure.legacy_relative_path}
                  </span>
                  <StatusBadge descriptor={scannerOutcome("FAILED")} dot />
                </div>
                <p className="cell-sub" style={{ marginTop: 6, color: "var(--danger-soft-text)" }}>
                  {failure.error_message}
                </p>
                <div className="data-list-actions">
                  <span className="meta">Last attempt {formatDateTime(failure.updated_at)}</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void retry(failure.id)}
                  >
                    <RefreshCcw aria-hidden="true" />
                    Retry
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const accent =
    tone === "danger"
      ? " metric-accent-danger"
      : tone === "warning"
        ? " metric-accent-warning"
        : tone === "success"
          ? " metric-accent-success"
          : "";
  return (
    <div className={`metric${accent}`}>
      {/* `metric-grid` is a description list here, so the pair must be dt/dd.
          A `span` inside a `dl > div` is not permitted, and it left the
          label/value relationship unexposed to assistive technology. The rest
          of the product already pairs dt/dd inside every other `dl`. */}
      <dt className="metric-label">{label}</dt>
      <dd className="metric-value">{value.toLocaleString("en-IN")}</dd>
    </div>
  );
}
