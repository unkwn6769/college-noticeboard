"use client";
import { useEffect, useState } from "react";

type StateTotals = { state: string; count: string; total_bytes: string }[];
type ByDept = { dept: string; count: string; total_bytes: string }[];
type ByOrigin = { origin: string; count: string; total_bytes: string }[];
type ByMime = { mime_group: string; count: string; total_bytes: string }[];
type UploadTrend = { day: string; count: string; total_bytes: string }[];
type NoticeStats = { status: string; count: string }[];

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
  stateTotals: StateTotals;
  byDepartment: ByDept;
  byOrigin: ByOrigin;
  byMimeGroup: ByMime;
  uploadTrend: UploadTrend;
  activeTotalBytes: string;
  noticeStats: NoticeStats;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex++;
  }
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

const PRESSURE_CLASS: Record<string, string> = {
  NORMAL: "badge badge-published",
  WARNING: "badge badge-warning",
  RESTRICTED: "badge badge-danger",
  EMERGENCY: "badge badge-danger",
};

export default function StoragePage() {
  const [data, setData] = useState<StorageData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/storage", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (error) return <div className="alert">{error}</div>;

  if (!data) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <p className="muted">Loading storage analytics…</p>
      </div>
    );
  }

  const { disk } = data;
  const activeTotalBytes = Number(data.activeTotalBytes);
  const postgresBytes = Number(data.postgresBytes);

  const maxDeptBytes = Math.max(
    1,
    ...data.byDepartment.map((d) => Number(d.total_bytes)),
  );
  const maxMimeBytes = Math.max(
    1,
    ...data.byMimeGroup.map((m) => Number(m.total_bytes)),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Storage Analytics</h1>
          <p className="muted">Real-time database and filesystem storage breakdown.</p>
        </div>
        <span className={PRESSURE_CLASS[disk.pressure] ?? "badge"}>
          {disk.pressure}
        </span>
      </div>

      {/* Disk overview */}
      <div className="stats" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="meta">Disk usage</div>
          <div className="stat-value">{disk.usagePercent.toFixed(1)}%</div>
          <div className="analytics-progress-bar" style={{ margin: "8px 0 4px" }}>
            <div
              className="analytics-progress-fill"
              style={{
                width: `${Math.min(100, disk.usagePercent)}%`,
                background: disk.usagePercent > 90 ? "#b91c1c" : disk.usagePercent > 80 ? "#ca8a04" : "#16a34a",
              }}
            />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {formatBytes(disk.totalBytes - disk.freeBytes)} used of {formatBytes(disk.totalBytes)}
          </div>
        </div>
        <div className="card">
          <div className="meta">Free space</div>
          <div className="stat-value">{formatBytes(disk.freeBytes)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>on storage volume</div>
        </div>
        <div className="card">
          <div className="meta">Active file bytes</div>
          <div className="stat-value">{formatBytes(activeTotalBytes)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>logical archive size</div>
        </div>
        <div className="card">
          <div className="meta">PostgreSQL DB</div>
          <div className="stat-value">{formatBytes(postgresBytes)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>database size</div>
        </div>
        <div className="card">
          <div className="meta">Pending cleanup</div>
          <div className="stat-value" style={{ color: Number(data.pendingCleanup) > 0 ? "#ca8a04" : "inherit" }}>
            {data.pendingCleanup}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>quarantine operations</div>
        </div>
      </div>

      {/* File states */}
      <div className="analytics-grid">
        <div className="card">
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Files by lifecycle state</h2>
          <div className="analytics-table">
            {data.stateTotals.map((s) => (
              <div className="analytics-row" key={s.state}>
                <span className="badge">{s.state}</span>
                <span className="muted">{Number(s.count).toLocaleString()} files</span>
                <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                  {formatBytes(Number(s.total_bytes))}
                </span>
              </div>
            ))}
            {data.stateTotals.length === 0 && (
              <p className="muted">No file records.</p>
            )}
          </div>
        </div>

        {/* Origin split */}
        <div className="card">
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Files by origin</h2>
          <div className="analytics-table">
            {data.byOrigin.map((o) => (
              <div className="analytics-row" key={o.origin}>
                <span className="badge">
                  {o.origin === "LEGACY_IMPORT" ? "Legacy archive" : "User uploads"}
                </span>
                <span className="muted">{Number(o.count).toLocaleString()} files</span>
                <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                  {formatBytes(Number(o.total_bytes))}
                </span>
              </div>
            ))}
          </div>

          <h2 style={{ margin: "24px 0 16px", fontSize: 18 }}>Notices by status</h2>
          <div className="analytics-table">
            {data.noticeStats.map((n) => (
              <div className="analytics-row" key={n.status}>
                <span className="badge">{n.status}</span>
                <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                  {Number(n.count).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MIME group breakdown */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Active files by type</h2>
        <div className="analytics-bar-chart">
          {data.byMimeGroup.map((m) => (
            <div className="analytics-bar-row" key={m.mime_group}>
              <div className="analytics-bar-label">
                <span>{m.mime_group}</span>
                <span className="muted" style={{ fontSize: 12 }}>{Number(m.count).toLocaleString()} files</span>
              </div>
              <div className="analytics-bar-wrap">
                <div
                  className="analytics-bar-fill"
                  style={{ width: `${(Number(m.total_bytes) / maxMimeBytes) * 100}%` }}
                />
              </div>
              <span className="analytics-bar-value">{formatBytes(Number(m.total_bytes))}</span>
            </div>
          ))}
          {data.byMimeGroup.length === 0 && <p className="muted">No active files.</p>}
        </div>
      </div>

      {/* Department breakdown */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Active files by department</h2>
        <div className="analytics-bar-chart">
          {data.byDepartment.map((d) => (
            <div className="analytics-bar-row" key={d.dept}>
              <div className="analytics-bar-label">
                <span>{d.dept.replace("-noticeboard", "") || "—"}</span>
                <span className="muted" style={{ fontSize: 12 }}>{Number(d.count).toLocaleString()} files</span>
              </div>
              <div className="analytics-bar-wrap">
                <div
                  className="analytics-bar-fill"
                  style={{ width: `${(Number(d.total_bytes) / maxDeptBytes) * 100}%` }}
                />
              </div>
              <span className="analytics-bar-value">{formatBytes(Number(d.total_bytes))}</span>
            </div>
          ))}
          {data.byDepartment.length === 0 && <p className="muted">No active files.</p>}
        </div>
      </div>

      {/* Upload trend */}
      {data.uploadTrend.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>User uploads — last 30 days</h2>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
            {data.uploadTrend.reduce((a, b) => a + Number(b.count), 0).toLocaleString()} files uploaded,{" "}
            {formatBytes(data.uploadTrend.reduce((a, b) => a + Number(b.total_bytes), 0))} total
          </p>
          <div className="analytics-trend-table">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Files uploaded</th>
                    <th>Total size</th>
                  </tr>
                </thead>
                <tbody>
                  {data.uploadTrend.slice(-14).reverse().map((t) => (
                    <tr key={t.day}>
                      <td className="muted" style={{ fontSize: 13 }}>{t.day}</td>
                      <td>{Number(t.count).toLocaleString()}</td>
                      <td>{formatBytes(Number(t.total_bytes))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
