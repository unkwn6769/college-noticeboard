import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type pg from "pg";
import { getDbPool, withTransaction } from "./db/pool";
import { getStorageEngine } from "./storage/engine";
import { config } from "./config";
import { sanitizeFilename } from "./security";
import { audit } from "./audit";
import { DEPARTMENTS, getDepartment } from "./department-registry";
import { classifyLegacyPath, compareCandidate, needsVerification, type ScannerComparison } from "./legacy-scanner-core";
import { createLegacySourceAdapter, FilesystemAdapter, type SourceAdapter, type SourceCandidate } from "./legacy-source-adapters";

export const LEGACY_NOTICEBOARD_ROOT = process.env.LEGACY_NOTICEBOARD_ROOT ?? "/mnt/legacy-noticeboards/noticeboards";
const LEGACY_HTTP_ROOT = (process.env.LEGACY_NOTICEBOARD_HTTP_ROOT ?? "http://10.24.14.231/noticeboards/").replace(/\/*$/, "/");

/**
 * Scanner diagnostics are assembled by the source adapter, which knows where the
 * legacy system physically lives: the internal HTTP host, or the mount point.
 * Those are deployment details, not scan results. The scanner screen already
 * shows every failure with its path relative to the source root, so dropping the
 * root costs an operator nothing and keeps the internal address of a system
 * that is explicitly out of scope for this application out of the UI.
 *
 * Applied on the way out rather than by rewriting stored rows, so runs recorded
 * before this existed are corrected without touching append-only history.
 */
export function redactLegacySourceDetails(message: string | null | undefined): string | null {
  if (message === null || message === undefined) return null;
  const text = String(message);
  if (!text) return text;
  return text
    .split(LEGACY_HTTP_ROOT)
    .join("")
    .split(LEGACY_NOTICEBOARD_ROOT)
    .join("")
    // Any remaining absolute URL loses its scheme and authority.
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/?#]+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
const VERIFY_MS = Number(process.env.LEGACY_SCANNER_VERIFY_INTERVAL_HOURS ?? 168) * 3600_000;
const LOCK = 172917;
const PREVIEW_TTL_MS = 10 * 60_000;
const PREVIEW_SECRET = randomBytes(32);
const PREVIEW_MANIFESTS = new Map<string, { expiresAt: number; preview: ApprovedPreview }>();
const ITEM_TIMEOUT_MS = Number(process.env.LEGACY_SCANNER_ITEM_TIMEOUT_MS ?? 180_000);
const SOURCE_CONCURRENCY = Math.max(1, Number(process.env.LEGACY_SCANNER_SOURCE_CONCURRENCY ?? 4));

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length }); let next = 0;
  const run = async () => { while (true) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index], index); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)); return results;
}
export type ScanMode = "DRY_RUN" | "IMPORT";
export type PreviewOutcome = "NEW" | "CHANGED" | "DUPLICATE" | "INVALID" | "FAILED";
export type PreviewCandidate = { relativePath: string; department: string | null; sizeBytes: number; mtimeMs: number; sha256: string | null; outcome: PreviewOutcome; error: string | null };
export type ApprovedPreview = { fingerprint: string; generatedAt: string; expiresAt: string; candidates: PreviewCandidate[]; discoveryFailures: { relativePathPrefix: string; status: number | null; error: string }[]; missingPaths: string[]; counts: { discovered: number; new: number; changed: number; duplicate: number; invalid: number; failed: number; missing: number } };
export type PreviewResult = ApprovedPreview & { approvalToken: string };
export type Candidate = SourceCandidate;
export type Comparison = ScannerComparison;
export { classifyLegacyPath, compareCandidate };
export async function discoverLegacyFiles(source = LEGACY_NOTICEBOARD_ROOT) { return new FilesystemAdapter(source).discover(); }

const scannerIdentity = (p: string) => createHash("sha256").update(p).digest("hex");
const itemIdentity = (p: string, h: string) => `scanner:${createHash("sha256").update(`${p}\0${h}`).digest("hex")}`;
function mime(name: string) { return ({ ".pdf": "application/pdf", ".txt": "text/plain", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" } as Record<string, string>)[path.extname(name).toLowerCase()] ?? "application/octet-stream"; }

function sourceError(error: unknown): Error {
  if (error instanceof Error && (error.name === "AbortError" || /aborted|timeout/i.test(error.message))) return new Error("Legacy source stream timed out or was aborted");
  return error instanceof Error ? error : new Error("Legacy source failure");
}

async function hashSource(adapter: SourceAdapter, candidate: Candidate) {
  const source = await adapter.open(candidate); const hash = createHash("sha256"); let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const consume = (async () => { for await (const chunk of source.stream as AsyncIterable<Buffer | Uint8Array | string>) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; hash.update(bytes); } })();
  try {
    await Promise.race([consume, new Promise<never>((_, reject) => { timer = setTimeout(() => { try { source.cancel?.(); } catch {} try { (source.stream as { destroy?: () => void }).destroy?.(); } catch {} reject(new Error(`Legacy source timed out after ${ITEM_TIMEOUT_MS}ms`)); }, ITEM_TIMEOUT_MS); })]);
    void consume.catch(() => {});
    if (candidate.sizeBytes > 0 && size !== candidate.sizeBytes) throw new Error("Legacy source size changed while being read");
    return { sha256: hash.digest("hex"), size, mtimeMs: candidate.mtimeMs };
  } catch (error) { throw sourceError(error); } finally { if (timer) clearTimeout(timer); try { source.cancel?.(); } catch {} }
}

function previewFingerprint(preview: Omit<ApprovedPreview, "fingerprint">): string {
  return createHash("sha256").update(JSON.stringify({
    candidates: [...preview.candidates].sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    discoveryFailures: [...preview.discoveryFailures].sort((a, b) => a.relativePathPrefix.localeCompare(b.relativePathPrefix)),
    missingPaths: [...preview.missingPaths].sort(),
  })).digest("hex");
}

function approvalToken(fingerprint: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ version: 1, fingerprint, expiresAt })).toString("base64url");
  const signature = createHmac("sha256", PREVIEW_SECRET).update(payload).digest("base64url");
  return `v1.${payload}.${signature}`;
}

function readApproval(token: string): ApprovedPreview {
  const [version, payload, signature] = token.split(".");
  if (version !== "v1" || !payload || !signature) throw new Error("A valid preview approval is required");
  const expected = createHmac("sha256", PREVIEW_SECRET).update(payload).digest();
  let actual: Buffer; try { actual = Buffer.from(signature, "base64url"); } catch { throw new Error("A valid preview approval is required"); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("A valid preview approval is required");
  let claims: { fingerprint?: string; expiresAt?: number };
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new Error("A valid preview approval is required"); }
  const preview = PREVIEW_MANIFESTS.get(claims.fingerprint ?? "");
  if (!preview || claims.expiresAt !== preview.expiresAt || claims.fingerprint !== preview.preview.fingerprint || claims.expiresAt <= Date.now()) throw new Error("Preview approval is expired or unavailable; run preview again");
  PREVIEW_MANIFESTS.delete(claims.fingerprint);
  return preview.preview;
}

export async function previewLegacyScan(dependencies: { adapter?: SourceAdapter; db?: Pick<pg.Pool, "query"> } = {}): Promise<PreviewResult> {
  const adapter = dependencies.adapter ?? createLegacySourceAdapter();
  const list = await adapter.discover();
  const discoveryFailures = (adapter.discoveryFailures ?? []).map((failure) => ({ relativePathPrefix: failure.relativePathPrefix, status: failure.status, error: failure.error }));
  const db = dependencies.db ?? getDbPool();
  const [items, files] = await Promise.all([
    db.query<Prior>("SELECT id,legacy_relative_path,source_size_bytes::text,source_mtime_ms::text,encode(source_sha256,'hex') source_sha256,source_verified_at::text,file_id,status FROM legacy_scanner_items"),
    db.query<{ id: string; legacy_relative_path: string; size_bytes: string; sha256: string }>("SELECT id,legacy_relative_path,size_bytes::text,encode(sha256,'hex') sha256 FROM files WHERE origin_type='LEGACY_IMPORT' AND state='ACTIVE' AND legacy_relative_path IS NOT NULL"),
  ]);
  const prior = new Map(items.rows.map((row) => [row.legacy_relative_path, row]));
  const existing = new Map<string, { id: string; size_bytes: string; sha256: string }[]>();
  for (const file of files.rows) existing.set(file.legacy_relative_path, [...(existing.get(file.legacy_relative_path) ?? []), file]);
  const candidates = await mapWithConcurrency(list, SOURCE_CONCURRENCY, async (candidate): Promise<PreviewCandidate> => {
    if (!candidate.department) return { relativePath: candidate.relativePath, department: null, sizeBytes: candidate.sizeBytes, mtimeMs: candidate.mtimeMs, sha256: null, outcome: "INVALID", error: "Top-level path is not a registered department" };
    try {
      const verified = await hashSource(adapter, candidate);
      const matching = existing.get(candidate.relativePath)?.find((file) => Number(file.size_bytes) === candidate.sizeBytes && file.sha256 === verified.sha256);
      const previous = prior.get(candidate.relativePath);
      const outcome: PreviewOutcome = matching || (previous?.source_sha256 === verified.sha256 && previous.file_id) ? "DUPLICATE" : previous ? "CHANGED" : "NEW";
      return { relativePath: candidate.relativePath, department: candidate.department, sizeBytes: candidate.sizeBytes, mtimeMs: candidate.mtimeMs, sha256: verified.sha256, outcome, error: null };
    } catch (error) {
      return { relativePath: candidate.relativePath, department: candidate.department, sizeBytes: candidate.sizeBytes, mtimeMs: candidate.mtimeMs, sha256: null, outcome: "FAILED", error: sourceError(error).message };
    }
  });
  const seen = new Set(list.map((candidate) => candidate.relativePath));
  const missingPaths = items.rows.filter((row) => !seen.has(row.legacy_relative_path) && !discoveryFailures.some((failure) => !failure.relativePathPrefix || row.legacy_relative_path === failure.relativePathPrefix || row.legacy_relative_path.startsWith(`${failure.relativePathPrefix}/`))).map((row) => row.legacy_relative_path).sort();
  const base: Omit<ApprovedPreview, "fingerprint"> = {
    generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(), candidates, discoveryFailures, missingPaths,
    counts: { discovered: list.length, new: candidates.filter((candidate) => candidate.outcome === "NEW").length, changed: candidates.filter((candidate) => candidate.outcome === "CHANGED").length, duplicate: candidates.filter((candidate) => candidate.outcome === "DUPLICATE").length, invalid: candidates.filter((candidate) => candidate.outcome === "INVALID").length, failed: candidates.filter((candidate) => candidate.outcome === "FAILED").length, missing: missingPaths.length },
  };
  const fingerprint = previewFingerprint(base);
  for (const [key, manifest] of PREVIEW_MANIFESTS) if (manifest.expiresAt <= Date.now()) PREVIEW_MANIFESTS.delete(key);
  const preview: ApprovedPreview = { ...base, fingerprint };
  PREVIEW_MANIFESTS.set(fingerprint, { expiresAt: Date.parse(preview.expiresAt), preview });
  return { ...preview, approvalToken: approvalToken(fingerprint, Date.parse(preview.expiresAt)) };
}

async function publish(adapter: SourceAdapter, candidate: Candidate, digest: string, actor: string) {
  const db = getDbPool(); const identity = itemIdentity(candidate.relativePath, digest); const known = await db.query<{ id: string }>("SELECT id FROM files WHERE legacy_item_id=$1", [identity]); if (known.rows[0]) return known.rows[0].id;
  const engine = getStorageEngine(); await engine.assertUploadCapacity(candidate.sizeBytes, config.largeUploadBytes, config.storageReserveBytes); const { stagingPath } = await engine.createStagingFile(); let storageKey: string | undefined;
  try {
    const source = await adapter.open(candidate); const written = await engine.writeStream(source.stream, stagingPath); if (candidate.sizeBytes > 0 && written.sizeBytes !== candidate.sizeBytes || written.sha256 !== digest) throw new Error("Legacy source changed while being read");
    await engine.finalizeWrite(stagingPath, written.sizeBytes, digest); storageKey = engine.createStorageKey(); await engine.publish(storageKey, stagingPath); if (!await engine.verify(storageKey, written.sizeBytes, digest)) throw new Error("Published legacy object verification failed");
    const fileId = randomUUID(), versionId = randomUUID();
    try { await withTransaction(async client => { await client.query("INSERT INTO files (id,original_name,mime_type,size_bytes,sha256,storage_key,state,created_by,origin_type,legacy_item_id,legacy_department,legacy_relative_path) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,'LEGACY_IMPORT',$8,$9,$10)", [fileId, sanitizeFilename(path.basename(candidate.relativePath)), candidate.contentType ?? mime(candidate.relativePath), written.sizeBytes, Buffer.from(digest, "hex"), storageKey, actor, identity, candidate.department, candidate.relativePath]); await client.query("INSERT INTO file_versions (id,file_id,version_number,storage_key,mime_type,size_bytes,sha256,created_by) VALUES ($1,$2,1,$3,$4,$5,$6,$7)", [versionId, fileId, storageKey, candidate.contentType ?? mime(candidate.relativePath), written.sizeBytes, Buffer.from(digest, "hex"), actor]); await client.query("UPDATE files SET current_version_id=$1 WHERE id=$2", [versionId, fileId]); }); } catch (error) { await engine.quarantine(storageKey); throw error; }
    await audit("LEGACY_SCANNER_FILE_IMPORTED", actor, "file", fileId, { legacyRelativePath: candidate.relativePath, sha256: digest }); return fileId;
  } catch (error) { if (!storageKey) try { await engine.quarantinePartial(stagingPath); } catch {} throw error; }
}

type Prior = { id: string; legacy_relative_path: string; source_size_bytes: string | null; source_mtime_ms: string | null; source_sha256: string | null; source_verified_at: string | null; file_id: string | null; status: string };
type Counts = { discovered: number; new: number; changed: number; missing: number; unchanged: number; imported: number; failed: number; skipped: number; processed: number };
async function stale(client: pg.PoolClient) { await client.query("UPDATE legacy_scanner_runs SET status='INTERRUPTED',completed_at=NOW(),error_message='Scanner lease expired',heartbeat_at=NOW() WHERE status='RUNNING' AND heartbeat_at<NOW()-INTERVAL '15 minutes'"); }
async function progress(client: pg.PoolClient, id: string, total: number, c: Counts, last: string | null) { await client.query("UPDATE legacy_scanner_runs SET heartbeat_at=NOW(),total_count=$2,processed_count=$3,last_processed_path=$4,discovered_count=$5,new_count=$6,changed_count=$7,missing_count=$8,unchanged_count=$9,imported_count=$10,failed_count=$11,skipped_count=$12 WHERE id=$1", [id, total, c.processed, last, c.discovered, c.new, c.changed, c.missing, c.unchanged, c.imported, c.failed, c.skipped]); }

export async function startLegacyScan(actor: string, mode: ScanMode, approval?: string) { const approved = mode === "IMPORT" ? readApproval(approval ?? "") : undefined; const client = await getDbPool().connect(); try { await stale(client); const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) locked", [LOCK]); if (!lock.rows[0]?.locked) throw new Error("A scanner run is already active"); const id = randomUUID(); await client.query("INSERT INTO legacy_scanner_runs(id,requested_by,mode,status)VALUES($1,$2,$3,'RUNNING')", [id, actor, mode]); void execute(client, id, actor, mode, approved); return id; } catch (error) { client.release(); throw error; } }
async function execute(client: pg.PoolClient, id: string, actor: string, mode: ScanMode, approved?: ApprovedPreview) {
  const c: Counts = { discovered: 0, new: 0, changed: 0, missing: 0, unchanged: 0, imported: 0, failed: 0, skipped: 0, processed: 0 }; const adapter = createLegacySourceAdapter();
  try { const list = await adapter.discover(); if (approved) { const approvedByPath = new Map(approved.candidates.map((candidate) => [candidate.relativePath, candidate])); const currentPaths = new Set(list.map((candidate) => candidate.relativePath)); if (currentPaths.size !== approved.candidates.length || [...currentPaths].some((relativePath) => !approvedByPath.has(relativePath))) throw new Error("Source candidate set changed since preview; run preview again"); } const sourceDirectoryFailures = adapter.discoveryFailures ?? []; const sourceDirectoryFailureMessage = sourceDirectoryFailures.length ? sourceDirectoryFailures.map(failure => `${failure.relativePathPrefix || "source root"} [${failure.status ?? "error"}]: ${failure.error}`).join("; ") : null; c.discovered = list.length; const [items, files] = await Promise.all([client.query<Prior>("SELECT id,legacy_relative_path,source_size_bytes::text,source_mtime_ms::text,encode(source_sha256,'hex') source_sha256,source_verified_at::text,file_id,status FROM legacy_scanner_items"), client.query<{ id: string; legacy_relative_path: string; size_bytes: string; sha256: string }>("SELECT id,legacy_relative_path,size_bytes::text,encode(sha256,'hex') sha256 FROM files WHERE origin_type='LEGACY_IMPORT' AND state='ACTIVE' AND legacy_relative_path IS NOT NULL")]); const prior = new Map(items.rows.map(row => [row.legacy_relative_path, row])); const existing = new Map<string, { id: string; size_bytes: string; sha256: string }[]>(); for (const file of files.rows) existing.set(file.legacy_relative_path, [...(existing.get(file.legacy_relative_path) ?? []), file]); const seen = new Set<string>(); const verifiedSources = new Map<string, { sha256: string; size: number; error: string | null }>(); if (mode === "IMPORT") { const hashed = await mapWithConcurrency(list.filter((candidate) => candidate.department), SOURCE_CONCURRENCY, async (candidate) => { try { const verified = await hashSource(adapter, candidate); return { relativePath: candidate.relativePath, sha256: verified.sha256, size: verified.size, error: null }; } catch (error) { return { relativePath: candidate.relativePath, sha256: "", size: 0, error: sourceError(error).message }; } }); for (const result of hashed) verifiedSources.set(result.relativePath, result); }
    for (const candidate of list) { seen.add(candidate.relativePath); const previous = prior.get(candidate.relativePath); const comparison = compareCandidate(candidate, previous); c[comparison]++; let digest: string | null = null; let fileId = previous?.file_id ?? null; let status = "OBSERVED"; let error: string | null = null; try { if (comparison === "skipped") status = "UNCLASSIFIABLE"; else if (mode === "IMPORT" || needsVerification(comparison, previous?.status, previous?.source_verified_at, Date.now(), VERIFY_MS)) { const verified = mode === "IMPORT" ? verifiedSources.get(candidate.relativePath) : await hashSource(adapter, candidate); if (mode === "IMPORT" && verifiedSources.get(candidate.relativePath)?.error) throw new Error(verifiedSources.get(candidate.relativePath)!.error!); if (mode === "IMPORT" && !verified) throw new Error("Legacy source was not verified before import"); digest = verified!.sha256; if (approved) { const approvedCandidate = approved.candidates.find((entry) => entry.relativePath === candidate.relativePath); if (!approvedCandidate || approvedCandidate.outcome === "FAILED" || approvedCandidate.outcome === "INVALID" || approvedCandidate.sha256 !== digest) throw new Error("Source changed or failed since preview; item was not imported"); } const matching = existing.get(candidate.relativePath)?.find(file => Number(file.size_bytes) === candidate.sizeBytes && file.sha256 === digest); if (!previous && matching) { c.new--; c.unchanged++; fileId = matching.id; status = "IMPORTED"; } else if (previous?.source_sha256 === digest && previous.file_id) { c[comparison]--; c.unchanged++; status = "IMPORTED"; } else { if (!previous && existing.has(candidate.relativePath)) { c.new--; c.changed++; } status = mode === "IMPORT" ? "IMPORTED" : "PENDING_IMPORT"; if (mode === "IMPORT") { fileId = await publish(adapter, candidate, digest, actor); c.imported++; } } } else status = previous?.file_id ? "IMPORTED" : "PENDING_IMPORT"; } catch (e) { c.failed++; status = "FAILED"; error = e instanceof Error ? e.message : "Scanner failure"; }
      await client.query("INSERT INTO legacy_scanner_items(id,scanner_identity,legacy_relative_path,department,source_size_bytes,source_mtime_ms,source_sha256,source_verified_at,file_id,status,last_seen_at,last_run_id,error_message)VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7::bytea IS NULL THEN NULL ELSE NOW() END,$8,$9,NOW(),$10,$11) ON CONFLICT(legacy_relative_path)DO UPDATE SET department=EXCLUDED.department,source_size_bytes=EXCLUDED.source_size_bytes,source_mtime_ms=EXCLUDED.source_mtime_ms,source_sha256=COALESCE(EXCLUDED.source_sha256,legacy_scanner_items.source_sha256),source_verified_at=COALESCE(EXCLUDED.source_verified_at,legacy_scanner_items.source_verified_at),file_id=COALESCE(EXCLUDED.file_id,legacy_scanner_items.file_id),status=EXCLUDED.status,last_seen_at=NOW(),last_run_id=EXCLUDED.last_run_id,error_message=EXCLUDED.error_message,updated_at=NOW()", [previous?.id ?? randomUUID(), scannerIdentity(candidate.relativePath), candidate.relativePath, candidate.department, candidate.sizeBytes, candidate.mtimeMs, digest ? Buffer.from(digest, "hex") : null, fileId, status, id, error]); c.processed++; if (c.processed % 10 === 0) await progress(client, id, list.length, c, candidate.relativePath); }
    const missing = items.rows.filter(row => !seen.has(row.legacy_relative_path) && !sourceDirectoryFailures.some(failure => !failure.relativePathPrefix || row.legacy_relative_path === failure.relativePathPrefix || row.legacy_relative_path.startsWith(`${failure.relativePathPrefix}/`))); c.missing = missing.length; if (missing.length) await client.query("UPDATE legacy_scanner_items SET status='MISSING',last_run_id=$1,updated_at=NOW() WHERE legacy_relative_path=ANY($2::text[])", [id, missing.map(row => row.legacy_relative_path)]); await progress(client, id, list.length, c, list.at(-1)?.relativePath ?? null); await client.query("UPDATE legacy_scanner_runs SET status='SUCCEEDED',completed_at=NOW(),error_message=$2 WHERE id=$1", [id, sourceDirectoryFailureMessage]); await audit("LEGACY_SCANNER_COMPLETED", actor, "legacy_scanner_run", null, { runId: id, mode, ...c, sourceDirectoryFailures: sourceDirectoryFailures.map(failure => ({ relativePathPrefix: failure.relativePathPrefix, status: failure.status, error: failure.error })) });
  } catch (e) { await client.query("UPDATE legacy_scanner_runs SET status='FAILED',completed_at=NOW(),error_message=$2 WHERE id=$1", [id, e instanceof Error ? e.message : "Unknown scanner failure"]); } finally { try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK]); } finally { client.release(); } }
}
export async function scannerStatus(id?: string) { const db = getDbPool(); const runs = await db.query(id ? "SELECT * FROM legacy_scanner_runs WHERE id=$1" : "SELECT * FROM legacy_scanner_runs ORDER BY started_at DESC LIMIT 10", id ? [id] : []); const failures = await db.query("SELECT id,legacy_relative_path,error_message,updated_at FROM legacy_scanner_items WHERE status='FAILED' ORDER BY updated_at DESC LIMIT 30"); return { runs: runs.rows.map(run => ({ ...run, error_message: redactLegacySourceDetails(run.error_message) })), failures: failures.rows.map(failure => ({ ...failure, error_message: redactLegacySourceDetails(failure.error_message) })), departments: DEPARTMENTS.map(d => d.slug) }; }
export async function retryLegacyScannerItem(id: string, actor: string) { const client = await getDbPool().connect(); try { await stale(client); const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) locked", [LOCK]); if (!lock.rows[0]?.locked) throw new Error("A scanner run is already active"); const result = await client.query<Prior>("SELECT id,legacy_relative_path,source_size_bytes::text,source_mtime_ms::text,encode(source_sha256,'hex') source_sha256,source_verified_at::text,file_id,status FROM legacy_scanner_items WHERE id=$1 AND status='FAILED'", [id]); const item = result.rows[0]; if (!item || !getDepartment(item.legacy_relative_path.split("/")[0])) throw new Error("Retryable scanner item not found"); const adapter = createLegacySourceAdapter(); const candidate = await adapter.resolve(item.legacy_relative_path); const verified = await hashSource(adapter, candidate); const fileId = await publish(adapter, candidate, verified.sha256, actor); await client.query("UPDATE legacy_scanner_items SET source_size_bytes=$1,source_mtime_ms=$2,source_sha256=$3,source_verified_at=NOW(),file_id=$4,status='IMPORTED',error_message=NULL,last_seen_at=NOW(),updated_at=NOW() WHERE id=$5", [verified.size, verified.mtimeMs, Buffer.from(verified.sha256, "hex"), fileId, id]); } finally { try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK]); } finally { client.release(); } } }
