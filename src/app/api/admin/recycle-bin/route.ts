import { NextResponse } from "next/server";
import { listDeletedNotices } from "@/src/lib/notices";
import { requireAdmin } from "@/src/lib/auth/session";
import { getDbPool } from "@/src/lib/db/pool";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const [notices, filesResult] = await Promise.all([
    listDeletedNotices(),
    getDbPool().query<{
      id: string;
      original_name: string;
      mime_type: string;
      size_bytes: string;
      storage_key: string;
      origin_type: string;
      legacy_department: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT f.id, f.original_name, f.mime_type, f.size_bytes::text,
              f.storage_key, f.origin_type, f.legacy_department,
              f.created_at, f.updated_at
         FROM files f
        WHERE f.state = 'QUARANTINED'
        ORDER BY f.updated_at DESC`,
    ),
  ]);

  return NextResponse.json({
    notices,
    files: filesResult.rows,
  });
}
