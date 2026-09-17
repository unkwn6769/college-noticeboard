import type pg from "pg";
import { getDbPool } from "@/src/lib/db/pool";

export async function audit(
  eventType: string,
  actorUserId: string | null,
  entityType?: string | null,
  entityId?: string | null,
  metadata: Record<string, unknown> = {},
  client?: pg.PoolClient,
): Promise<void> {
  const db = client ?? getDbPool();
  await db.query(
    `INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorUserId, eventType, entityType ?? null, entityId ?? null, JSON.stringify(metadata)],
  );
}
