import { NextResponse } from "next/server";
import { getDbPool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/session";
import { jsonError } from "@/src/lib/http";
export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
  const result = await getDbPool().query(
    `SELECT a.id, a.event_type, a.entity_type, a.entity_id, a.metadata, a.created_at,
            u.email AS actor_email
       FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id
      ORDER BY a.created_at DESC LIMIT 200`,
  );
  return NextResponse.json({ events: result.rows });
}
