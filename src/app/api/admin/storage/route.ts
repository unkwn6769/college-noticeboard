import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { getDbPool } from "@/src/lib/db/pool";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);

  const diskStats = await getStorageEngine().getDiskStats();
  const db = getDbPool();

  const [
    postgresResult,
    quarantineResult,
    // Total file bytes per state
    stateTotals,
    // File counts and bytes by department (legacy files)
    byDepartment,
    // Counts by origin type
    byOrigin,
    // Counts by MIME type category
    byMimeGroup,
    // Upload trend: files uploaded per day for last 30 days
    uploadTrend,
    // Total logical bytes stored in active files
    activeTotalBytes,
    // Notice counts by status
    noticeStats,
  ] = await Promise.all([
    db.query<{ bytes: string }>(
      `SELECT pg_database_size(current_database())::text AS bytes`,
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cleanup_operations WHERE operation_type='QUARANTINE' AND status IN ('PENDING','FAILED')`,
    ),
    db.query<{ state: string; count: string; total_bytes: string }>(
      `SELECT state, COUNT(*)::text AS count, COALESCE(SUM(size_bytes),0)::text AS total_bytes
         FROM files GROUP BY state ORDER BY state`,
    ),
    db.query<{ dept: string; count: string; total_bytes: string }>(
      `SELECT COALESCE(legacy_department,'user-uploads') AS dept,
              COUNT(*)::text AS count,
              COALESCE(SUM(size_bytes),0)::text AS total_bytes
         FROM files
        WHERE state='ACTIVE'
        GROUP BY legacy_department
        ORDER BY SUM(size_bytes) DESC
        LIMIT 20`,
    ),
    db.query<{ origin: string; count: string; total_bytes: string }>(
      `SELECT origin_type AS origin, COUNT(*)::text AS count,
              COALESCE(SUM(size_bytes),0)::text AS total_bytes
         FROM files WHERE state='ACTIVE'
         GROUP BY origin_type ORDER BY origin_type`,
    ),
    db.query<{ mime_group: string; count: string; total_bytes: string }>(
      `SELECT
         CASE
           WHEN mime_type LIKE 'image/%' THEN 'Images'
           WHEN mime_type LIKE 'video/%' THEN 'Video'
           WHEN mime_type LIKE 'audio/%' THEN 'Audio'
           WHEN mime_type IN ('application/pdf') THEN 'PDF'
           WHEN mime_type IN ('application/msword',
                              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                              'application/vnd.oasis.opendocument.text') THEN 'Documents'
           WHEN mime_type IN ('application/vnd.ms-excel',
                              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                              'application/vnd.oasis.opendocument.spreadsheet') THEN 'Spreadsheets'
           WHEN mime_type IN ('application/zip','application/x-zip-compressed','application/x-rar-compressed','application/x-7z-compressed') THEN 'Archives'
           WHEN mime_type LIKE 'text/%' THEN 'Text'
           ELSE 'Other'
         END AS mime_group,
         COUNT(*)::text AS count,
         COALESCE(SUM(size_bytes),0)::text AS total_bytes
       FROM files WHERE state='ACTIVE'
       GROUP BY 1 ORDER BY SUM(size_bytes) DESC`,
    ),
    db.query<{ day: string; count: string; total_bytes: string }>(
      `SELECT DATE(created_at) AS day, COUNT(*)::text AS count,
              COALESCE(SUM(size_bytes),0)::text AS total_bytes
         FROM files
        WHERE origin_type = 'USER_UPLOAD'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY day`,
    ),
    db.query<{ total_bytes: string }>(
      `SELECT COALESCE(SUM(size_bytes),0)::text AS total_bytes FROM files WHERE state='ACTIVE'`,
    ),
    db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM notices WHERE deleted_at IS NULL GROUP BY status`,
    ),
  ]);

  return NextResponse.json({
    disk: diskStats,
    postgresBytes: postgresResult.rows[0]?.bytes ?? "0",
    pendingCleanup: quarantineResult.rows[0]?.count ?? "0",
    stateTotals: stateTotals.rows,
    byDepartment: byDepartment.rows,
    byOrigin: byOrigin.rows,
    byMimeGroup: byMimeGroup.rows,
    uploadTrend: uploadTrend.rows,
    activeTotalBytes: activeTotalBytes.rows[0]?.total_bytes ?? "0",
    noticeStats: noticeStats.rows,
  });
}
