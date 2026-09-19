import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getDbPool } from "@/src/lib/db/pool";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) {
    return jsonError("Unauthorized", 401);
  }

  const result = await getDbPool().query<{ legacy_department: string }>(
    `SELECT DISTINCT legacy_department
       FROM files
      WHERE origin_type = 'LEGACY_IMPORT'
        AND state = 'ACTIVE'
        AND legacy_department IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM legacy_scanner_items s WHERE s.legacy_relative_path=files.legacy_relative_path AND s.status='IMPORTED' AND s.file_id IS NOT NULL AND s.file_id<>files.id)
      ORDER BY legacy_department`,
  );

  return NextResponse.json({
    departments: result.rows.map((row) => row.legacy_department),
  });
}
