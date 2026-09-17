import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { getDbPool } from "@/src/lib/db/pool";
import { jsonError } from "@/src/lib/http";
export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
  const stats = await getStorageEngine().getDiskStats();
  const db = await getDbPool().query<{ bytes: string }>(`SELECT pg_database_size(current_database())::text AS bytes`);
  const quarantine = await getDbPool().query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cleanup_operations WHERE operation_type='QUARANTINE' AND status IN ('PENDING','FAILED')`);
  return NextResponse.json({ stats, postgresBytes: db.rows[0]?.bytes ?? "0", pendingCleanup: quarantine.rows[0]?.count ?? "0" });
}
