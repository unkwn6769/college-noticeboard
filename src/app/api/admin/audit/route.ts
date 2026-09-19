import { NextResponse } from "next/server";
import { getDbPool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/session";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

function normalizePage(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function normalizePageSize(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 50;
  return Math.min(200, Math.max(10, parsed));
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);

  if (url.searchParams.get("meta") === "true") {
    // Return unique values for dropdowns
    const db = getDbPool();
    const [eventTypes, entityTypes] = await Promise.all([
      db.query(`SELECT DISTINCT event_type FROM audit_events ORDER BY event_type`),
      db.query(`SELECT DISTINCT entity_type FROM audit_events WHERE entity_type IS NOT NULL ORDER BY entity_type`)
    ]);
    return NextResponse.json({
      eventTypes: eventTypes.rows.map(r => r.event_type),
      entityTypes: entityTypes.rows.map(r => r.entity_type)
    });
  }

  const page = normalizePage(url.searchParams.get("page"));
  const pageSize = normalizePageSize(url.searchParams.get("pageSize"));
  const offset = (page - 1) * pageSize;

  const eventType = url.searchParams.get("eventType") || null;
  const entityType = url.searchParams.get("entityType") || null;
  const entityId = url.searchParams.get("entityId") || null;
  const actorEmail = url.searchParams.get("actorEmail") || null;
  const dateFrom = url.searchParams.get("dateFrom") || null;
  const dateTo = url.searchParams.get("dateTo") || null;

  const whereParams: any[] = [];
  const whereClauses: string[] = ["1=1"];
  let paramIdx = 1;

  if (eventType) {
    whereClauses.push(`a.event_type = $${paramIdx++}`);
    whereParams.push(eventType);
  }

  if (entityType) {
    whereClauses.push(`a.entity_type = $${paramIdx++}`);
    whereParams.push(entityType);
  }

  if (entityId) {
    whereClauses.push(`a.entity_id = $${paramIdx++}`);
    whereParams.push(entityId);
  }

  if (actorEmail) {
    whereClauses.push(`u.email ILIKE $${paramIdx++}`);
    whereParams.push(`%${actorEmail}%`);
  }

  if (dateFrom) {
    whereClauses.push(`a.created_at >= $${paramIdx++}`);
    whereParams.push(dateFrom);
  }

  if (dateTo) {
    whereClauses.push(`a.created_at <= $${paramIdx++}`);
    whereParams.push(dateTo);
  }

  const whereSql = whereClauses.join(" AND ");
  const pool = getDbPool();

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT a.id, a.event_type, a.entity_type, a.entity_id, a.metadata, a.created_at,
              u.email AS actor_email, u.display_name AS actor_name
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE ${whereSql}
        ORDER BY a.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...whereParams, pageSize, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::bigint AS total
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE ${whereSql}`,
      whereParams
    )
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);

  return NextResponse.json({
    events: rowsResult.rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  });
}
