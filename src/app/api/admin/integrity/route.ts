import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/session";
import { getDbPool } from "@/src/lib/db/pool";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { jsonError } from "@/src/lib/http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export const runtime = "nodejs";

// Maximum number of files to checksum-verify in a single request
// (full scan can be slow on large archives — we report the rest as unchecked)
const FULL_CHECKSUM_LIMIT = 200;

type IntegrityIssue = {
  type: string;
  severity: "error" | "warning" | "info";
  fileId?: string;
  storageKey?: string;
  originalName?: string;
  detail: string;
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const checksums = url.searchParams.get("checksums") === "true";

  const db = getDbPool();
  const engine = getStorageEngine();
  const issues: IntegrityIssue[] = [];

  // ── 1. Active files: check storage objects exist on disk ─────────────────
  const activeFiles = await db.query<{
    id: string;
    storage_key: string;
    original_name: string;
    size_bytes: string;
    sha256: string;
    state: string;
    current_version_id: string | null;
    origin_type: string;
  }>(
    `SELECT f.id, f.storage_key, f.original_name, f.size_bytes::text,
            encode(f.sha256,'hex') AS sha256, f.state, f.current_version_id, f.origin_type
       FROM files f
      WHERE f.state = 'ACTIVE'
      ORDER BY f.created_at DESC`,
  );

  let missingCount = 0;
  let checksumErrors = 0;
  let sizeErrors = 0;
  let checksumVerified = 0;
  let checksumSkipped = 0;

  const STORAGE_ROOT = process.env.NOTICEBOARD_STORAGE_ROOT ?? "/srv/noticeboard";

  for (const file of activeFiles.rows) {
    const objectPath = path.join(
      STORAGE_ROOT,
      "files",
      file.storage_key.slice(0, 2).toLowerCase(),
      file.storage_key,
      "object",
    );

    let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null;
    try {
      stat = await fs.lstat(objectPath);
    } catch {
      stat = null;
    }

    if (!stat || !stat.isFile()) {
      missingCount++;
      issues.push({
        type: "MISSING_STORAGE_OBJECT",
        severity: "error",
        fileId: file.id,
        storageKey: file.storage_key,
        originalName: file.original_name,
        detail: `Active file has no storage object on disk: ${file.storage_key}`,
      });
      continue;
    }

    // Size check
    if (stat.size !== Number(file.size_bytes)) {
      sizeErrors++;
      issues.push({
        type: "SIZE_MISMATCH",
        severity: "error",
        fileId: file.id,
        storageKey: file.storage_key,
        originalName: file.original_name,
        detail: `Size mismatch: DB=${file.size_bytes}, disk=${stat.size}`,
      });
    }

    // Checksum check (optionally limited)
    if (checksums && checksumVerified < FULL_CHECKSUM_LIMIT) {
      try {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(objectPath)) {
          hash.update(chunk as Buffer);
        }
        const diskSha256 = hash.digest("hex");
        if (diskSha256 !== file.sha256) {
          checksumErrors++;
          issues.push({
            type: "CHECKSUM_MISMATCH",
            severity: "error",
            fileId: file.id,
            storageKey: file.storage_key,
            originalName: file.original_name,
            detail: `SHA-256 mismatch: DB=${file.sha256.slice(0, 16)}…, disk=${diskSha256.slice(0, 16)}…`,
          });
        }
        checksumVerified++;
      } catch (err) {
        issues.push({
          type: "CHECKSUM_READ_ERROR",
          severity: "error",
          fileId: file.id,
          storageKey: file.storage_key,
          originalName: file.original_name,
          detail: `Could not read file for checksum: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else if (checksums) {
      checksumSkipped++;
    }
  }

  // ── 2. Files with missing current_version_id ─────────────────────────────
  const noVersion = await db.query(
    `SELECT f.id, f.original_name, f.storage_key
       FROM files f
      WHERE f.state = 'ACTIVE' AND f.current_version_id IS NULL`,
  );
  for (const row of noVersion.rows) {
    issues.push({
      type: "MISSING_VERSION_RECORD",
      severity: "warning",
      fileId: row.id,
      storageKey: row.storage_key,
      originalName: row.original_name,
      detail: "Active file has no current_version_id set.",
    });
  }

  // ── 3. Orphaned storage objects (on disk but not in DB) ──────────────────
  let orphanCount = 0;
  try {
    const allFilesResult = await db.query(`SELECT storage_key FROM files`);
    const knownKeys = new Set(allFilesResult.rows.map((f) => f.storage_key));
    const objects = await engine.scanObjects();
    for (const objPath of objects) {
      // Extract storage key from path: .../files/<shard>/<key>/object
      const parts = objPath.split(path.sep);
      const keyIndex = parts.indexOf("files") + 2;
      const storageKey = parts[keyIndex];
      if (storageKey && !knownKeys.has(storageKey)) {
        orphanCount++;
        if (orphanCount <= 20) {
          issues.push({
            type: "ORPHANED_STORAGE_OBJECT",
            severity: "warning",
            storageKey,
            detail: `Storage object exists on disk but has no ACTIVE file record in DB: ${storageKey}`,
          });
        }
      }
    }
    if (orphanCount > 20) {
      issues.push({
        type: "ORPHANED_STORAGE_OBJECT",
        severity: "warning",
        detail: `${orphanCount - 20} additional orphaned objects not listed individually.`,
      });
    }
  } catch {
    // Not fatal — storage scan may fail during normal operations
  }

  // ── 4. Staging files older than expected ─────────────────────────────────
  let staleStagingHours = Number(process.env.STAGING_RETENTION_HOURS ?? 6);
  if (!Number.isFinite(staleStagingHours)) staleStagingHours = 6;

  const staleStaging = await db.query(
    `SELECT id, original_name, storage_key
       FROM files
      WHERE state='STAGING'
        AND created_at < NOW() - ($1::text || ' hours')::interval`,
    [staleStagingHours]
  );
  for (const row of staleStaging.rows) {
    issues.push({
      type: "STALE_STAGING",
      severity: "warning",
      fileId: row.id,
      storageKey: row.storage_key,
      originalName: row.original_name,
      detail: `File has been in STAGING state for more than ${staleStagingHours} hours.`,
    });
  }

  // ── 5. Duplicate SHA-256 among active files ───────────────────────────────
  const duplicates = await db.query<{ sha256: string; count: string }>(
    `SELECT encode(sha256,'hex') AS sha256, COUNT(*)::text AS count
       FROM files
      WHERE state='ACTIVE'
      GROUP BY sha256
      HAVING COUNT(*) > 1`,
  );
  for (const row of duplicates.rows) {
    issues.push({
      type: "DUPLICATE_CONTENT",
      severity: "info",
      detail: `${row.count} active files share SHA-256 ${row.sha256.slice(0, 16)}…`,
    });
  }

  // ── 6. Files referencing non-existent version records ────────────────────
  const badVersionRef = await db.query(
    `SELECT f.id, f.original_name, f.storage_key, f.current_version_id
       FROM files f
       LEFT JOIN file_versions v ON v.id = f.current_version_id
      WHERE f.current_version_id IS NOT NULL AND v.id IS NULL`,
  );
  for (const row of badVersionRef.rows) {
    issues.push({
      type: "BROKEN_VERSION_REFERENCE",
      severity: "error",
      fileId: row.id,
      storageKey: row.storage_key,
      originalName: row.original_name,
      detail: `current_version_id ${row.current_version_id} does not exist in file_versions.`,
    });
  }

  // ── 7. Notice attachments referencing non-active files ───────────────────
  const badAttachments = await db.query(
    `SELECT na.id, na.notice_id, na.file_id, f.state, f.original_name
       FROM notice_attachments na
       JOIN files f ON f.id = na.file_id
      WHERE f.state <> 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM notices n WHERE n.id=na.notice_id AND n.deleted_at IS NOT NULL)`,
  );
  for (const row of badAttachments.rows) {
    issues.push({
      type: "ATTACHMENT_NOT_ACTIVE",
      severity: "warning",
      fileId: row.file_id,
      originalName: row.original_name,
      detail: `Notice attachment references file in state ${row.state} (notice: ${row.notice_id})`,
    });
  }

  const summary = {
    totalActiveFiles: activeFiles.rows.length,
    missingStorageObjects: missingCount,
    sizeMismatches: sizeErrors,
    checksumErrors,
    checksumVerified,
    checksumSkipped,
    orphanedObjects: orphanCount,
    staleStaging: staleStaging.rows.length,
    duplicateContent: duplicates.rows.length,
    brokenVersionRefs: badVersionRef.rows.length,
    badAttachments: badAttachments.rows.length,
    issueCount: issues.length,
    healthy: issues.filter((i) => i.severity === "error").length === 0,
    checksumMode: checksums ? "full" : "skipped",
  };

  return NextResponse.json({ summary, issues });
}
