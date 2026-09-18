import { randomUUID } from "node:crypto";
import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertUuid, sanitizeFilename } from "@/src/lib/security";

export type FileRecord = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  sha256: Buffer;
  storage_key: string;
  state: "STAGING" | "ACTIVE" | "QUARANTINED" | "PURGED";
  current_version_id: string | null;
  version_number?: number;
  origin_type?: "USER_UPLOAD" | "LEGACY_IMPORT";
  legacy_item_id?: string | null;
  legacy_department?: string | null;
  legacy_relative_path?: string | null;
  created_at: string;
  updated_at: string;
};

export function hashHex(hash: Buffer): string {
  return hash.toString("hex");
}

export type FileListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  department?: string;
  origin?: "USER_UPLOAD" | "LEGACY_IMPORT";
  state?: "STAGING" | "ACTIVE" | "QUARANTINED" | "PURGED";
};

export type PaginatedFileList = {
  files: FileRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function normalizePage(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value === undefined || value < 1) return 1;
  return value;
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value === undefined) return 50;
  return Math.min(100, Math.max(10, value));
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 100);
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized.slice(0, 128) : null;
}

export async function listFiles(filters: FileListFilters = {}): Promise<PaginatedFileList> {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  const search = normalizeSearch(filters.search);
  const department = normalizeOptionalText(filters.department);
  const origin = filters.origin ?? null;
  const state = filters.state ?? null;
  const offset = (page - 1) * pageSize;

  const params = [
    search,
    department,
    origin,
    state,
    pageSize,
    offset,
  ];

  const meaningfulLegacyPathSql = `
    CASE
      WHEN f.origin_type = 'LEGACY_IMPORT'
        AND f.legacy_department IS NOT NULL
        AND f.legacy_relative_path IS NOT NULL
        AND left(f.legacy_relative_path, length(f.legacy_department) + 1) = f.legacy_department || '/'
      THEN substring(f.legacy_relative_path FROM length(f.legacy_department) + 2)
      ELSE f.legacy_relative_path
    END
  `;

  const where = `
    WHERE
      ($1 = '' OR f.original_name ILIKE '%' || $1 || '%' OR (${meaningfulLegacyPathSql}) ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR f.legacy_department = $2)
      AND ($3::text IS NULL OR f.origin_type = $3)
      AND ($4::file_state IS NULL OR f.state = $4)
  `;

  const pool = getDbPool();

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT
         f.id,
         f.original_name,
         f.mime_type,
         f.size_bytes,
         encode(f.sha256, 'hex') AS sha256,
         f.storage_key,
         f.state,
         f.current_version_id,
         f.origin_type,
         f.legacy_item_id,
         f.legacy_department,
         f.legacy_relative_path,
         f.created_at,
         f.updated_at,
         COALESCE(v.version_number, 1) AS version_number
       FROM files f
       LEFT JOIN file_versions v ON v.id = f.current_version_id
       ${where}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT $5 OFFSET $6`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*)::bigint AS total
       FROM files f
       ${where}`,
      params.slice(0, 4),
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);

  return {
    files: rowsResult.rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createFileRecord(input: {
  id: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; createdBy: string;
}) {
  const { id, originalName, mimeType, sizeBytes, sha256, storageKey, createdBy } = input;
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO files (id, original_name, mime_type, size_bytes, sha256, storage_key, state, created_by)
       VALUES ($1, $2, $3, $4, decode($5, 'hex'), $6, 'STAGING', $7)`,
      [id, sanitizeFilename(originalName), mimeType, sizeBytes, sha256, storageKey, createdBy],
    );
    return id;
  });
}

export async function publishNewFile(input: {
  id: string; versionId: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; createdBy: string;
}) {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO files (id, original_name, mime_type, size_bytes, sha256, storage_key, state, created_by)
       VALUES ($1, $2, $3, $4, decode($5, 'hex'), $6, 'ACTIVE', $7)`,
      [input.id, sanitizeFilename(input.originalName), input.mimeType, input.sizeBytes, input.sha256, input.storageKey, input.createdBy],
    );
    await client.query(
      `INSERT INTO file_versions (id, file_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by)
       VALUES ($1, $2, 1, $3, $4, $5, decode($6, 'hex'), $7)`,
      [input.versionId, input.id, input.storageKey, input.mimeType, input.sizeBytes, input.sha256, input.createdBy],
    );
    await client.query("UPDATE files SET current_version_id = $1 WHERE id = $2", [input.versionId, input.id]);
    return input.id;
  });
}

export async function replaceFile(input: {
  fileId: string; versionId: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; actorId: string;
}) {
  assertUuid(input.fileId);
  return withTransaction(async (client) => {
    const current = await client.query<{ storage_key: string; version_number: number }>(
      `SELECT f.storage_key,
              COALESCE((SELECT version_number FROM file_versions WHERE id = f.current_version_id), 0) AS version_number
         FROM files f
        WHERE f.id = $1 AND f.state = 'ACTIVE'
        FOR UPDATE`,
      [input.fileId],
    );
    const old = current.rows[0];
    if (!old) throw new Error("FILE_NOT_ACTIVE");
    const nextVersion = old.version_number + 1;
    await client.query(
      `INSERT INTO file_versions (id, file_id, version_number, storage_key, mime_type, size_bytes, sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, decode($7, 'hex'), $8)`,
      [input.versionId, input.fileId, nextVersion, input.storageKey, input.mimeType, input.sizeBytes, input.sha256, input.actorId],
    );
    await client.query(
      `UPDATE files SET original_name=$1, mime_type=$2, size_bytes=$3, sha256=decode($4,'hex'), storage_key=$5,
              current_version_id=$6, updated_at=NOW() WHERE id=$7`,
      [sanitizeFilename(input.originalName), input.mimeType, input.sizeBytes, input.sha256, input.storageKey, input.versionId, input.fileId],
    );
    const cleanupId = randomUUID();
    await client.query(
      `INSERT INTO cleanup_operations (id, file_id, operation_type, status, storage_key)
       VALUES ($1, $2, 'QUARANTINE', 'PENDING', $3)`,
      [cleanupId, input.fileId, old.storage_key],
    );
    await audit("FILE_REPLACED", input.actorId, "file", input.fileId, { oldStorageKey: old.storage_key, newStorageKey: input.storageKey }, client);
    return { oldStorageKey: old.storage_key, cleanupId, versionNumber: nextVersion };
  });
}

export async function markDeleted(fileId: string, actorId: string) {
  assertUuid(fileId);
  return withTransaction(async (client) => {
    const result = await client.query<{ storage_key: string }>(
      `SELECT storage_key FROM files WHERE id = $1 AND state = 'ACTIVE' FOR UPDATE`, [fileId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("FILE_NOT_ACTIVE");
    const cleanupId = randomUUID();
    await client.query(
      `UPDATE files SET state='QUARANTINED', updated_at=NOW() WHERE id=$1`, [fileId],
    );
    const versions = await client.query<{ storage_key: string }>(
      `SELECT storage_key FROM file_versions WHERE file_id=$1`,
      [fileId],
    );
    for (const version of versions.rows) {
      await client.query(
        `INSERT INTO cleanup_operations (id, file_id, operation_type, status, storage_key)
         SELECT $1, $2, 'QUARANTINE', 'PENDING', $3
          WHERE NOT EXISTS (
            SELECT 1 FROM cleanup_operations
             WHERE file_id=$2 AND storage_key=$3
               AND operation_type='QUARANTINE' AND status <> 'FAILED'
          )`,
        [randomUUID(), fileId, version.storage_key],
      );
    }
    await audit("FILE_DELETED", actorId, "file", fileId, {}, client);
    return { cleanupId, storageKey: row.storage_key };
  });
}
