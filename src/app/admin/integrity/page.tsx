"use client";

import { useState } from "react";

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

const SEVERITY_CLASS: Record<string, string> = {
  error: "badge badge-danger",
  warning: "badge badge-warning",
  info: "badge",
};

const SEVERITY_LABEL: Record<string, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export default function IntegrityPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [issues, setIssues] = useState<IntegrityIssue[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [withChecksums, setWithChecksums] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");

  async function runCheck() {
    setRunning(true);
    setError("");
    setSummary(null);
    setIssues([]);

    try {
      const url = `/api/admin/integrity${withChecksums ? "?checksums=true" : ""}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Check failed");
      setSummary(d.summary);
      setIssues(d.issues ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integrity check failed");
    } finally {
      setRunning(false);
    }
  }

  const filteredIssues = issues.filter((i) => filter === "all" || i.severity === filter);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Archive Integrity</h1>
          <p className="muted">
            Check storage objects, checksums, orphaned records, and database consistency.
          </p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 12px" }}>Run integrity check</h2>
        <div className="actions" style={{ alignItems: "center" }}>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={withChecksums}
              onChange={(e) => setWithChecksums(e.target.checked)}
              disabled={running}
            />
            Verify SHA-256 checksums (slower, reads all file bytes)
          </label>
          <button className="btn" onClick={runCheck} disabled={running}>
            {running ? "Scanning…" : "Run check"}
          </button>
        </div>
        {!summary && !running && (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            A quick scan (no checksums) runs in seconds for most archives. A full checksum scan reads all bytes from disk and may take minutes for large archives.
          </p>
        )}
      </div>

      {running && (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p className="muted">Scanning archive…</p>
        </div>
      )}

      {summary && (
        <>
          <div className={`integrity-status-banner${summary.healthy ? " healthy" : " unhealthy"}`}>
            <span style={{ fontSize: 20 }}>{summary.healthy ? "✅" : "⚠️"}</span>
            <span>
              {summary.healthy
                ? "No errors found."
                : `${issues.filter((i) => i.severity === "error").length} error${issues.filter((i) => i.severity === "error").length !== 1 ? "s" : ""} detected.`}
              {" "}
              {summary.issueCount} issue{summary.issueCount !== 1 ? "s" : ""} total across {summary.totalActiveFiles.toLocaleString()} active files.
            </span>
          </div>

          <div className="stats" style={{ margin: "20px 0" }}>
            <div className="card">
              <div className="meta">Active files</div>
              <div className="stat-value">{summary.totalActiveFiles.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="meta">Missing objects</div>
              <div className="stat-value" style={{ color: summary.missingStorageObjects > 0 ? "#b91c1c" : "inherit" }}>
                {summary.missingStorageObjects}
              </div>
            </div>
            <div className="card">
              <div className="meta">Size mismatches</div>
              <div className="stat-value" style={{ color: summary.sizeMismatches > 0 ? "#b91c1c" : "inherit" }}>
                {summary.sizeMismatches}
              </div>
            </div>
            <div className="card">
              <div className="meta">Checksum errors</div>
              <div className="stat-value" style={{ color: summary.checksumErrors > 0 ? "#b91c1c" : "inherit" }}>
                {summary.checksumErrors}
                {summary.checksumMode === "skipped" && (
                  <span className="muted" style={{ fontSize: 13, fontWeight: 400, display: "block" }}>
                    (not checked)
                  </span>
                )}
              </div>
            </div>
            <div className="card">
              <div className="meta">Orphaned objects</div>
              <div className="stat-value" style={{ color: summary.orphanedObjects > 0 ? "#ca8a04" : "inherit" }}>
                {summary.orphanedObjects}
              </div>
            </div>
            <div className="card">
              <div className="meta">Stale staging</div>
              <div className="stat-value" style={{ color: summary.staleStaging > 0 ? "#ca8a04" : "inherit" }}>
                {summary.staleStaging}
              </div>
            </div>
          </div>

          {issues.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h2>All checks passed</h2>
              <p className="muted">
                No integrity issues found{summary.checksumMode === "skipped" ? " (checksum verification was skipped)" : ""}.
              </p>
            </div>
          ) : (
            <>
              <div className="actions" style={{ marginBottom: 12, justifyContent: "space-between" }}>
                <div className="actions">
                  {(["all", "error", "warning", "info"] as const).map((s) => (
                    <button
                      key={s}
                      className={`tab-btn${filter === s ? " active" : ""}`}
                      onClick={() => setFilter(s)}
                    >
                      {s === "all" ? `All (${issues.length})` : `${SEVERITY_LABEL[s]} (${issues.filter((i) => i.severity === s).length})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Type</th>
                      <th>File</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue, i) => (
                      <tr key={i}>
                        <td>
                          <span className={SEVERITY_CLASS[issue.severity] ?? "badge"}>
                            {SEVERITY_LABEL[issue.severity] ?? issue.severity}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: 12 }}>{issue.type}</code>
                        </td>
                        <td>
                          {issue.originalName && (
                            <div style={{ fontWeight: 600 }}>{issue.originalName}</div>
                          )}
                          {issue.fileId && (
                            <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>
                              {issue.fileId}
                            </div>
                          )}
                          {!issue.originalName && !issue.fileId && (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>{issue.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
