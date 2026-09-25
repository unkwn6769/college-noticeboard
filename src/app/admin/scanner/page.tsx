"use client";
import { useCallback, useEffect, useState } from "react";

type Run = { id: string; mode: string; status: string; started_at: string; completed_at: string | null; heartbeat_at: string; total_count: number; processed_count: number; last_processed_path: string | null; discovered_count: number; new_count: number; changed_count: number; missing_count: number; unchanged_count: number; imported_count: number; failed_count: number; skipped_count: number; error_message: string | null };
type Preview = { fingerprint: string; generatedAt: string; expiresAt: string; approvalToken: string; counts: { discovered: number; new: number; changed: number; duplicate: number; invalid: number; failed: number; missing: number }; discoveryFailures: { relativePathPrefix: string; status: number | null; error: string }[]; candidates: { relativePath: string; department: string | null; sizeBytes: number; outcome: string; error: string | null }[] };
type Data = { runs: Run[]; failures: { id: string; legacy_relative_path: string; error_message: string; updated_at: string }[] };

export default function ScannerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (id = runId) => {
    try {
      const response = await fetch(`/api/admin/scanner${id ? `?runId=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load scanner");
    }
  }, [runId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function runPreview() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/scanner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PREVIEW" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setPreview(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to preview scanner");
    } finally { setBusy(false); }
  }

  async function start(mode: "DRY_RUN" | "IMPORT") {
    if (mode === "IMPORT" && !preview) { setError("Run and review preview before importing"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/scanner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, ...(mode === "IMPORT" ? { approvalToken: preview?.approvalToken } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setRunId(body.runId); setPreview(null); await load(body.runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start scanner");
    } finally { setBusy(false); }
  }

  async function retry(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/scanner/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Retry failed"); }
    finally { setBusy(false); }
  }

  const run = data?.runs[0];
  return <>
    <div className="page-header"><div><h1>Legacy Scanner</h1><p className="muted">Read-only preview, approval, and controlled import.</p></div></div>
    {error && <div className="alert">{error}</div>}
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>Scan controls</h2>
      <div className="actions">
        <button className="btn secondary" disabled={busy} onClick={() => void runPreview()}>Preview source (read-only)</button>
        <button className="btn secondary" disabled={busy} onClick={() => void start("DRY_RUN")}>Legacy dry run</button>
        <button className="btn" disabled={busy || !preview} onClick={() => void start("IMPORT")}>Approve and import preview</button>
      </div>
      {preview && <div className="notice" style={{ marginTop: 16 }}><strong>Preview ready:</strong> {preview.counts.discovered} candidates; {preview.counts.new} new, {preview.counts.changed} changed, {preview.counts.duplicate} duplicate, {preview.counts.invalid} invalid, {preview.counts.failed} failed, {preview.counts.missing} missing. Approval expires {new Date(preview.expiresAt).toLocaleString()}.</div>}
      {run && <p className="muted">Latest run: {run.status} — {run.processed_count}/{run.total_count || run.discovered_count} processed{run.error_message ? `; ${run.error_message}` : ""}.</p>}
    </div>
    {data?.failures && data.failures.length > 0 && <div className="card"><h2>Failed items</h2>{data.failures.map((failure) => <div key={failure.id} className="notice"><code>{failure.legacy_relative_path}</code>: {failure.error_message} <button className="btn secondary" disabled={busy} onClick={() => void retry(failure.id)}>Retry</button></div>)}</div>}
  </>;
}
