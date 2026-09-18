import { randomUUID } from "node:crypto";
import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertUuid } from "@/src/lib/security";
import { normalizeNoticeMetadata } from "./notice-metadata";

export async function listPublishedNotices(
  query = "",
  limit = 50,
  options: { department?: string } = {},
) {
  const q = query.trim();
  const department = options.department?.trim() || null;
  const boundedLimit = Number.isSafeInteger(limit)
    ? Math.min(50, Math.max(1, limit))
    : 50;

  const result = await getDbPool().query(
    `SELECT n.id, n.title, n.body, n.department, n.category, n.is_pinned,
            n.published_at, n.updated_at, u.display_name AS author
       FROM notices n
       JOIN users u ON u.id = n.author_id
      WHERE n.status = 'PUBLISHED'
        AND (
          $1 = ''
          OR n.title ILIKE '%' || $1 || '%'
          OR n.body ILIKE '%' || $1 || '%'
          OR n.department ILIKE '%' || $1 || '%'
          OR n.category ILIKE '%' || $1 || '%'
        )
        AND ($3::text IS NULL OR n.department = $3)
      ORDER BY n.is_pinned DESC, n.published_at DESC, n.id DESC
      LIMIT $2`,
    [q, boundedLimit, department],
  );

  return result.rows;
}
export async function getNotice(id: string, includeDrafts = false) {
  assertUuid(id);
  const result = await getDbPool().query(
    `SELECT n.id, n.title, n.body, n.department, n.category, n.is_pinned,
            n.status, n.published_at, n.created_at, n.updated_at,
            u.display_name AS author
       FROM notices n JOIN users u ON u.id=n.author_id
      WHERE n.id=$1 ${includeDrafts ? "" : "AND n.status='PUBLISHED'"}`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listAdminNotices() {
  const result = await getDbPool().query(
    `SELECT n.id, n.title, n.body, n.department, n.category, n.is_pinned,
            n.status, n.published_at, n.created_at, n.updated_at,
            u.display_name AS author
       FROM notices n JOIN users u ON u.id=n.author_id
      ORDER BY n.updated_at DESC`,
  );
  return result.rows;
}

export async function createNotice(input: {
  title: string;
  body: string;
  authorId: string;
  department?: unknown;
  category?: unknown;
  isPinned?: unknown;
}) {
  const id = randomUUID();
  const metadata = normalizeNoticeMetadata(input);
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO notices
        (id,title,body,status,author_id,department,category,is_pinned)
       VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7)`,
      [id, input.title.trim(), input.body, input.authorId, metadata.department, metadata.category, metadata.isPinned],
    );
    await audit("NOTICE_CREATED", input.authorId, "notice", id, {}, client);
  });
  return id;
}

export async function updateNotice(id: string, input: {
  title: string;
  body: string;
  actorId: string;
  department?: unknown;
  category?: unknown;
  isPinned?: unknown;
}) {
  assertUuid(id);
  const metadata = normalizeNoticeMetadata(input);
  await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE notices
          SET title=$1, body=$2, department=$3, category=$4, is_pinned=$5, updated_at=NOW()
        WHERE id=$6`,
      [input.title.trim(), input.body, metadata.department, metadata.category, metadata.isPinned, id],
    );
    if (result.rowCount !== 1) throw new Error("NOTICE_NOT_FOUND");
    await audit("NOTICE_UPDATED", input.actorId, "notice", id, {}, client);
  });
}

export async function publishNotice(id: string, actorId: string) {
  assertUuid(id);
  await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE notices SET status='PUBLISHED', published_at=COALESCE(published_at,NOW()), updated_at=NOW()
        WHERE id=$1 AND status <> 'PUBLISHED'`, [id],
    );
    if (result.rowCount !== 1) throw new Error("NOTICE_NOT_FOUND_OR_PUBLISHED");
    await audit("NOTICE_PUBLISHED", actorId, "notice", id, {}, client);
  });
}

export async function archiveNotice(id: string, actorId: string) {
  assertUuid(id);
  await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE notices SET status='ARCHIVED', updated_at=NOW() WHERE id=$1 AND status <> 'ARCHIVED'`, [id],
    );
    if (result.rowCount !== 1) throw new Error("NOTICE_NOT_FOUND_OR_ARCHIVED");
    await audit("NOTICE_ARCHIVED", actorId, "notice", id, {}, client);
  });
}
