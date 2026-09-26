"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, HardDrive, Layers, RefreshCcw, Tag, TrendingUp } from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import ErrorState from "@/src/components/ErrorState";
import EmptyState from "@/src/components/EmptyState";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { SkeletonRegion, SkeletonMetrics, SkeletonText } from "@/src/components/Skeleton";
import { fileState, humanise, noticeStatus, storagePressure } from "@/src/lib/status";
import { formatBytes, formatCount } from "@/src/lib/format";

type StorageData = {
  disk: {
    writable: boolean;
    usagePercent: number;
    pressure: string;
    freeBytes: number;
    totalBytes: number;
  };
  postgresBytes: string;
  pendingCleanup: string;
  stateTotals: Array<{ state: string; count: string; total_bytes: string }>;
  byDepartment: Array<{ dept: string; count: string; total_bytes: string }>;
  byOrigin: Array<{ origin: string; count: string; total_bytes: string }>;
  byMimeGroup: Array<{ mime_group: string; count: string; total_bytes: string }>;
  uploadTrend: Array<{ day: string; count: string; total_bytes: string }>;
  activeTotalBytes: string;
  noticeStats: Array<{ status: string; count: string }>;
};

export default function StoragePage() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/storage", { cache: "no-store" });
      // A proxy or server failure can return HTML; parsing must not surface a
      // raw parser/driver message in the UI.
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.error) {
        throw new Error(body?.error ?? "Storage analytics could not be loaded.");
      }
      setData(body as StorageData);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Storage analytics could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <ErrorState
        title="Storage analytics unavailable"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (loading || !data) {
    return (
      <>
        <PageHeader
          breadcrumbs={<Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Storage" }]} />}
          eyebrow="Operations"
          title="Storage"
          description="Real-time database and filesystem storage breakdown."
        />
        <SkeletonRegion label="Loading storage analytics.">
          <SkeletonMetrics count={5} />
          <div className="admin-grid-2" style={{ marginTop: "var(--space-5)" }}>
            <div className="admin-section">
              <SkeletonText lines={5} />
            </div>
            <div className="admin-section">
              <SkeletonText lines={5} />
            </div>
          </div>
        </SkeletonRegion>
      </>
    );
  }

  const { disk } = data;
  const activeTotalBytes = Number(data.activeTotalBytes);
  const postgresBytes = Number(data.postgresBytes);
  const maxDeptBytes = Math.max(1, ...data.byDepartment.map((row) => Number(row.total_bytes)));
  const maxMimeBytes = Math.max(1, ...data.byMimeGroup.map((row) => Number(row.total_bytes)));
  const trendTotal = data.uploadTrend.reduce((total, row) => total + Number(row.count), 0);
  const trendBytes = data.uploadTrend.reduce(
    (total, row) => total + Number(row.total_bytes),
    0,
  );
  const pressure = storagePressure(disk.pressure);
  const pendingCleanup = Number(data.pendingCleanup);

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Storage" }]} />}
        eyebrow="Operations"
        title="Storage"
        description="Real-time database and filesystem storage breakdown, measured from the live volume and the database."
        actions={
          <>
            <StatusBadge descriptor={pressure} dot />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCcw aria-hidden="true" />
              Refresh
            </button>
          </>
        }
      />

      <section aria-label="Storage headline figures">
        <div className="metric-grid">
          <div
            className={`metric${pressure.tone === "success" ? " metric-accent-success" : pressure.tone === "warning" ? " metric-accent-warning" : " metric-accent-danger"}`}
          >
            <span className="metric-label">
              <HardDrive aria-hidden="true" />
              Disk usage
            </span>
            <span className="metric-value">{disk.usagePercent.toFixed(1)}%</span>
            <span className="meter" aria-hidden="true">
              <span
                className={`meter-fill${pressure.tone === "success" ? " meter-fill-success" : pressure.tone === "warning" ? " meter-fill-warning" : " meter-fill-danger"}`}
                style={{ width: `${Math.min(100, disk.usagePercent)}%` }}
              />
            </span>
            <span className="metric-hint">
              {formatBytes(disk.totalBytes - disk.freeBytes)} of{" "}
              {formatBytes(disk.totalBytes)} · {pressure.label}
            </span>
          </div>

          <div className="metric">
            <span className="metric-label">
              <HardDrive aria-hidden="true" />
              Free space
            </span>
            <span className="metric-value">
              {formatBytes(disk.freeBytes, { fallback: "unknown" })}
            </span>
            <span className="metric-hint">
              {disk.writable ? "Storage volume is writable" : "Storage volume is NOT writable"}
            </span>
          </div>

          <div className="metric">
            <span className="metric-label">
              <Layers aria-hidden="true" />
              Active file bytes
            </span>
            <span className="metric-value">
              {formatBytes(activeTotalBytes, { fallback: "—" })}
            </span>
            <span className="metric-hint">Logical size of active archive content</span>
          </div>

          <div className="metric">
            <span className="metric-label">
              <Database aria-hidden="true" />
              PostgreSQL size
            </span>
            <span className="metric-value">
              {formatBytes(postgresBytes, { fallback: "—" })}
            </span>
            <span className="metric-hint">Database, including the audit log</span>
          </div>

          <div className={`metric${pendingCleanup > 0 ? " metric-accent-warning" : ""}`}>
            <span className="metric-label">
              <Trash2Icon />
              Pending cleanup
            </span>
            <span className="metric-value">{formatCount(pendingCleanup)}</span>
            <span className="metric-hint">Quarantine operations awaiting completion</span>
          </div>
        </div>
      </section>

      <section className="admin-grid-2 section" aria-label="Storage breakdowns">
        <div className="admin-section">
          <h2 className="admin-section-title">Files by lifecycle state</h2>
          <p className="admin-section-desc">
            Every file record, grouped by its storage state. Only ACTIVE files are publicly
            downloadable.
          </p>
          {data.stateTotals.length === 0 ? (
            <EmptyState compact icon={Layers} title="No file records" description="Nothing has been stored yet." />
          ) : (
            <dl className="summary-list" style={{ marginTop: "var(--space-4)" }}>
              {data.stateTotals.map((row) => (
                <div className="summary-row" key={row.state}>
                  <dt>
                    <StatusBadge descriptor={fileState(row.state)} dot />
                  </dt>
                  <dd style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span className="muted" style={{ fontWeight: 400, fontSize: "var(--text-2xs)" }}>
                      {formatCount(row.count)} files
                    </span>
                    <span>{formatBytes(row.total_bytes)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="admin-section">
          <h2 className="admin-section-title">Files by origin</h2>
          <p className="admin-section-desc">
            Where the bytes came from: the migrated legacy archive or an operator upload.
          </p>
          {data.byOrigin.length === 0 ? (
            <EmptyState compact icon={Tag} title="No origin data" description="Nothing has been stored yet." />
          ) : (
            <dl className="summary-list" style={{ marginTop: "var(--space-4)" }}>
              {data.byOrigin.map((row) => (
                <div className="summary-row" key={row.origin}>
                  <dt>{row.origin === "LEGACY_IMPORT" ? "Legacy archive" : "User uploads"}</dt>
                  <dd style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span className="muted" style={{ fontWeight: 400, fontSize: "var(--text-2xs)" }}>
                      {formatCount(row.count)} files
                    </span>
                    <span>{formatBytes(row.total_bytes)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <h2 className="admin-section-title" style={{ marginTop: "var(--space-5)" }}>
            Notices by status
          </h2>
          {data.noticeStats.length === 0 ? (
            <EmptyState compact icon={Tag} title="No notices" description="No notice records exist yet." />
          ) : (
            <dl className="summary-list" style={{ marginTop: "var(--space-3)" }}>
              {data.noticeStats.map((row) => (
                <div className="summary-row" key={row.status}>
                  <dt>
                    <StatusBadge descriptor={noticeStatus(row.status)} dot />
                  </dt>
                  <dd>{formatCount(row.count)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="admin-section section" aria-labelledby="mime-title">
        <h2 className="admin-section-title" id="mime-title">
          Active files by type
        </h2>
        <p className="admin-section-desc">
          Bytes held per media group, relative to the largest group.
        </p>
        {data.byMimeGroup.length === 0 ? (
          <EmptyState compact icon={Tag} title="No active files" description="Nothing is currently active in storage." />
        ) : (
          <div className="stack" style={{ marginTop: "var(--space-4)" }}>
            {data.byMimeGroup.map((row) => (
              <div className="bar-row" key={row.mime_group}>
                <span className="bar-row-label">
                  <span>{humanise(row.mime_group)}</span>
                  <span>{formatCount(row.count)} files</span>
                </span>
                <span className="meter" aria-hidden="true">
                  <span
                    className="meter-fill"
                    style={{ width: `${(Number(row.total_bytes) / maxMimeBytes) * 100}%` }}
                  />
                </span>
                <span className="bar-row-value">{formatBytes(row.total_bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section section" aria-labelledby="dept-title">
        <h2 className="admin-section-title" id="dept-title">
          Active files by department
        </h2>
        <p className="admin-section-desc">
          Where the archive weight actually sits, by department.
        </p>
        {data.byDepartment.length === 0 ? (
          <EmptyState compact icon={Tag} title="No active files" description="Nothing is currently active in storage." />
        ) : (
          <div className="stack" style={{ marginTop: "var(--space-4)" }}>
            {data.byDepartment.map((row) => (
              <div className="bar-row" key={row.dept}>
                <span className="bar-row-label">
                  <span>{row.dept.replace("-noticeboard", "") || "—"}</span>
                  <span>{formatCount(row.count)} files</span>
                </span>
                <span className="meter" aria-hidden="true">
                  <span
                    className="meter-fill"
                    style={{ width: `${(Number(row.total_bytes) / maxDeptBytes) * 100}%` }}
                  />
                </span>
                <span className="bar-row-value">{formatBytes(row.total_bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.uploadTrend.length > 0 ? (
        <section className="admin-section section" aria-labelledby="trend-title">
          <h2 className="admin-section-title" id="trend-title">
            <TrendingUp aria-hidden="true" style={{ width: 16, height: 16, display: "inline", verticalAlign: "-3px" }} />{" "}
            User uploads — last 30 days
          </h2>
          <p className="admin-section-desc">
            {formatCount(trendTotal)} file{trendTotal === 1 ? "" : "s"} uploaded by operators,{" "}
            {formatBytes(trendBytes)} in total. Days with no uploads are omitted.
          </p>
          <div className="table-wrap" style={{ marginTop: "var(--space-4)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Files uploaded
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Total size
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.uploadTrend.slice(-14).reverse().map((row) => (
                  <tr key={row.day}>
                    <td className="muted mono">{row.day}</td>
                    <td className="num">{formatCount(row.count)}</td>
                    <td className="num">{formatBytes(row.total_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Trash2Icon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
