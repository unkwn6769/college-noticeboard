import Link from "next/link";
import { getDbPool } from "@/src/lib/db/pool";
import { listFiles } from "@/src/lib/files";
import { getStorageEngine } from "@/src/lib/storage/engine";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const db = getDbPool();
  const [noticeStats, fileStats, userStats, cleanupStats] = await Promise.all([
    db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM notices WHERE status='PUBLISHED'`),
    db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM files WHERE state='ACTIVE'`),
    db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users WHERE status='ACTIVE'`),
    db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cleanup_operations WHERE status IN ('PENDING','FAILED')`),
  ]);
  const disk = await getStorageEngine().getDiskStats();
  const files = await listFiles();

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Operational overview.</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/admin/notices/new">New notice</Link>
          <Link className="btn secondary" href="/admin/files">Files</Link>
        </div>
      </div>

      <div className="stats">
        <div className="card"><div className="meta">Published notices</div><div className="stat-value">{noticeStats.rows[0]?.count ?? "0"}</div></div>
        <div className="card"><div className="meta">Active files</div><div className="stat-value">{fileStats.rows[0]?.count ?? "0"}</div></div>
        <div className="card"><div className="meta">Active users</div><div className="stat-value">{userStats.rows[0]?.count ?? "0"}</div></div>
        <div className="card"><div className="meta">Pending cleanup</div><div className="stat-value">{cleanupStats.rows[0]?.count ?? "0"}</div></div>
        <div className="card"><div className="meta">Storage</div><div className="stat-value">{disk.usagePercent.toFixed(1)}%</div><div>{disk.pressure}</div></div>
      </div>

      <div className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Storage safety</h2>
          <p className="muted">{(disk.freeBytes / 1024 / 1024 / 1024).toFixed(1)} GB free of {(disk.totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB.</p>
          <Link className="btn secondary" href="/admin/storage">Inspect storage</Link>
        </div>
        <div className="card">
          <h2>File records</h2>
          <p className="muted">{files.length} records returned.</p>
          <Link className="btn secondary" href="/admin/files">Manage files</Link>
        </div>
      </div>
    </>
  );
}
