import { getDbPool } from "@/src/lib/db/pool";
import { assertUuid } from "@/src/lib/security";
import { normalizeArchivePath } from "./archive-path";

export type ArchiveFolder = {
  name: string;
  path: string;
  fileCount: number;
};

export type ArchiveFile = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
  created_at: string;
  updated_at: string;
  legacy_department: string | null;
  legacy_relative_path: string | null;
};

export type ArchiveDirectory = {
  department: string;
  path: string;
  folders: ArchiveFolder[];
  files: ArchiveFile[];
  page: number;
  pageSize: number;
  totalFiles: number;
  totalDepartmentFiles: number;
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

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

const meaningfulPathSql = `
  CASE
    WHEN f.origin_type = 'LEGACY_IMPORT'
      AND f.legacy_department IS NOT NULL
      AND f.legacy_relative_path IS NOT NULL
      AND left(f.legacy_relative_path, length(f.legacy_department) + 1) = f.legacy_department || '/'
    THEN substring(f.legacy_relative_path FROM length(f.legacy_department) + 2)
    ELSE f.legacy_relative_path
  END
`;

export async function listArchiveDirectory(input: {
  department: string;
  path?: string;
  page?: number;
  pageSize?: number;
}): Promise<ArchiveDirectory> {
  const department = input.department.trim().slice(0, 128);
  if (!department) throw new Error("Invalid department");

  const path = normalizeArchivePath(input.path);
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const offset = (page - 1) * pageSize;
  const escapedPath = escapeLike(path);
  const params = [department, path, escapedPath];

  const pool = getDbPool();
  const common = `
    WITH archive AS (
      SELECT
        f.id,
        f.original_name,
        f.mime_type,
        f.size_bytes,
        encode(f.sha256, 'hex') AS sha256,
        f.created_at,
        f.updated_at,
        f.legacy_relative_path,
        ${meaningfulPathSql} AS meaningful_path
      FROM files f
      WHERE f.state = 'ACTIVE'
        AND f.origin_type = 'LEGACY_IMPORT'
        AND f.legacy_department = $1
        AND NOT EXISTS (SELECT 1 FROM legacy_scanner_items s WHERE s.legacy_relative_path=f.legacy_relative_path AND s.status='IMPORTED' AND s.file_id IS NOT NULL AND s.file_id<>f.id)
    ),
    at_location AS (
      SELECT
        a.*,
        CASE
          WHEN $2 = '' THEN a.meaningful_path
          ELSE substring(a.meaningful_path FROM length($2) + 2)
        END AS remainder
      FROM archive a
      WHERE $2 = ''
         OR a.meaningful_path LIKE $3 || '/%' ESCAPE '\\'
    )
  `;

  const folderPromise = pool.query<{ name: string; file_count: number }>(
    `${common}
     SELECT
       split_part(remainder, '/', 1) AS name,
       COUNT(*)::int AS file_count
     FROM at_location
     WHERE remainder LIKE '%/%'
     GROUP BY 1
     ORDER BY lower(split_part(remainder, '/', 1)), split_part(remainder, '/', 1)`,
    params,
  );

  const filesPromise = pool.query<ArchiveFile>(
    `${common}
     SELECT id, original_name, mime_type, size_bytes, sha256, created_at, updated_at, legacy_relative_path
     FROM at_location
     WHERE remainder <> '' AND position('/' in remainder) = 0
     ORDER BY created_at DESC, id DESC
     LIMIT $4 OFFSET $5`,
    [department, path, escapedPath, pageSize, offset],
  );

  const countPromise = pool.query<{ total: string }>(
    `${common}
     SELECT COUNT(*)::bigint AS total
     FROM at_location
     WHERE remainder <> '' AND position('/' in remainder) = 0`,
    params,
  );

  const departmentCountPromise = pool.query<{ total: string }>(
    `SELECT COUNT(*)::bigint AS total
     FROM files f
     WHERE f.state = 'ACTIVE'
       AND f.origin_type = 'LEGACY_IMPORT'
       AND NOT EXISTS (SELECT 1 FROM legacy_scanner_items s WHERE s.legacy_relative_path=f.legacy_relative_path AND s.status='IMPORTED' AND s.file_id IS NOT NULL AND s.file_id<>f.id)
       AND f.legacy_department = $1`,
    [department],
  );

  const [folderResult, filesResult, countResult, departmentCountResult] = await Promise.all([
    folderPromise,
    filesPromise,
    countPromise,
    departmentCountPromise,
  ]);
  const totalFiles = Number(countResult.rows[0]?.total ?? 0);
  const totalDepartmentFiles = Number(departmentCountResult.rows[0]?.total ?? 0);

  return {
    department,
    path,
    folders: folderResult.rows.map((row) => ({
      name: row.name,
      path: path ? `${path}/${row.name}` : row.name,
      fileCount: row.file_count,
    })),
    files: filesResult.rows,
    page,
    pageSize,
    totalFiles,
    totalDepartmentFiles,
    totalPages: Math.max(1, Math.ceil(totalFiles / pageSize)),
  };
}

export async function listRecentArchiveFiles(limit = 8): Promise<ArchiveFile[]> {
  const boundedLimit = Number.isSafeInteger(limit)
    ? Math.min(12, Math.max(1, limit))
    : 8;

  const result = await getDbPool().query<ArchiveFile>(
    `SELECT
       f.id,
       f.original_name,
       f.mime_type,
       f.size_bytes,
       encode(f.sha256, 'hex') AS sha256,
       f.created_at,
       f.updated_at,
       f.legacy_department,
       f.legacy_relative_path
     FROM files f
     WHERE f.state = 'ACTIVE'
       AND f.origin_type = 'LEGACY_IMPORT'
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT $1`,
    [boundedLimit],
  );

  return result.rows;
}

export async function getArchiveFile(input: { department: string; id: string }): Promise<ArchiveFile | null> {
  assertUuid(input.id);
  const department = input.department.trim().slice(0, 128);
  if (!department) return null;

  const result = await getDbPool().query<ArchiveFile>(
    `SELECT
       f.id,
       f.original_name,
       f.mime_type,
       f.size_bytes,
       encode(f.sha256, 'hex') AS sha256,
       f.created_at,
       f.updated_at,
       f.legacy_department,
       f.legacy_relative_path
     FROM files f
     WHERE f.id = $1
       AND f.state = 'ACTIVE'
       AND f.origin_type = 'LEGACY_IMPORT'
       AND f.legacy_department = $2
       AND NOT EXISTS (SELECT 1 FROM legacy_scanner_items s WHERE s.legacy_relative_path=f.legacy_relative_path AND s.status='IMPORTED' AND s.file_id IS NOT NULL AND s.file_id<>f.id)
     LIMIT 1`,
    [input.id, department],
  );

  return result.rows[0] ?? null;
}
