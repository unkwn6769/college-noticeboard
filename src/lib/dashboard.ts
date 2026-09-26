import { getDbPool } from "@/src/lib/db/pool";
import { getStorageEngine } from "@/src/lib/storage/engine";

/**
 * Everything the operational dashboard needs, in one round trip group.
 *
 * Only cheap, indexed counts are collected here. A full integrity scan reads
 * every file and is deliberately *not* run on page load — the dashboard
 * surfaces the same signals as a summary and links to the Integrity page,
 * where the operator chooses to pay that cost.
 */
export type DashboardSnapshot = {
  notices: { published: number; draft: number; archived: number; total: number };
  files: { active: number; quarantined: number; staging: number; total: number };
  users: { active: number; disabled: number; total: number };
  pendingCleanup: number;
  orphanedFileRows: number;
  attachmentsNotActive: number;
  storage: {
    usagePercent: number;
    pressure: string;
    freeBytes: number;
    totalBytes: number;
    writable: boolean;
  };
  recentActivity: Array<{
    id: string;
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
    actor_name: string | null;
  }>;
  latestNotice: { title: string; published_at: string | null } | null;
  latestFileAt: string | null;
};

const RECENT_ACTIVITY_LIMIT = 8;

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const db = getDbPool();

  const [
    noticeStats,
    fileStats,
    userStats,
    pendingCleanup,
    orphanedFileRows,
    attachmentsNotActive,
    recentActivity,
    latestNotice,
    latestFile,
  ] = await Promise.all([
    db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM notices WHERE deleted_at IS NULL GROUP BY status`,
    ),
    db.query<{ state: string; count: string }>(
      `SELECT state, COUNT(*)::text AS count FROM files GROUP BY state`,
    ),
    db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM users GROUP BY status`,
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cleanup_operations WHERE status IN ('PENDING','FAILED')`,
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM files f
        WHERE NOT EXISTS (SELECT 1 FROM file_versions v WHERE v.id = f.current_version_id)
          AND f.current_version_id IS NOT NULL`,
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notice_attachments na
         JOIN files f ON f.id = na.file_id
        WHERE f.state <> 'ACTIVE'`,
    ),
    db.query<{
      id: string;
      event_type: string;
      entity_type: string | null;
      entity_id: string | null;
      created_at: string;
      actor_name: string | null;
    }>(
      `SELECT a.id, a.event_type, a.entity_type, a.entity_id, a.created_at,
              u.display_name AS actor_name
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1`,
      [RECENT_ACTIVITY_LIMIT],
    ),
    db.query<{ title: string; published_at: string | null }>(
      `SELECT title, published_at FROM notices
        WHERE status = 'PUBLISHED' AND deleted_at IS NULL
        ORDER BY published_at DESC LIMIT 1`,
    ),
    db.query<{ latest: string | null }>(
      `SELECT MAX(created_at)::text AS latest FROM files WHERE state = 'ACTIVE'`,
    ),
  ]);

  const disk = await getStorageEngine().getDiskStats();

  const noticesByStatus = new Map(noticeStats.rows.map((row) => [row.status, Number(row.count)]));
  const filesByState = new Map(fileStats.rows.map((row) => [row.state, Number(row.count)]));
  const usersByStatus = new Map(userStats.rows.map((row) => [row.status, Number(row.count)]));

  const sum = (map: Map<string, number>) =>
    Array.from(map.values()).reduce((total, value) => total + value, 0);

  return {
    notices: {
      published: noticesByStatus.get("PUBLISHED") ?? 0,
      draft: noticesByStatus.get("DRAFT") ?? 0,
      archived: noticesByStatus.get("ARCHIVED") ?? 0,
      total: sum(noticesByStatus),
    },
    files: {
      active: filesByState.get("ACTIVE") ?? 0,
      quarantined: filesByState.get("QUARANTINED") ?? 0,
      staging: filesByState.get("STAGING") ?? 0,
      total: sum(filesByState),
    },
    users: {
      active: usersByStatus.get("ACTIVE") ?? 0,
      disabled: usersByStatus.get("DISABLED") ?? 0,
      total: sum(usersByStatus),
    },
    pendingCleanup: Number(pendingCleanup.rows[0]?.count ?? 0),
    orphanedFileRows: Number(orphanedFileRows.rows[0]?.count ?? 0),
    attachmentsNotActive: Number(attachmentsNotActive.rows[0]?.count ?? 0),
    storage: disk,
    recentActivity: recentActivity.rows,
    latestNotice: latestNotice.rows[0] ?? null,
    latestFileAt: latestFile.rows[0]?.latest ?? null,
  };
}
