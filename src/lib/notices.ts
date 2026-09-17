import { randomUUID } from "node:crypto";
import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertUuid } from "@/src/lib/security";

export async function listPublishedNotices(query = "") {
  const q = query.trim();
  const result = await getDbPool().query(
    `SELECT n.id, n.title, n.body, n.published_at, n.updated_at, u.display_name AS author
       FROM notices n JOIN users u ON u.id = n.author_id
      WHERE n.status='PUBLISHED'
        AND ($1 = '' OR n.title ILIKE '%' || $1 || '%' OR n.body ILIKE '%' || $1 || '%')
      ORDER BY n.published_at DESC`, [q],
  );
  return result.rows;
}

export async function getNotice(id: string, includeDrafts = false) {
  assertUuid(id);
  const result = await getDbPool().query(
    `SELECT n.id, n.title, n.body, n.status, n.published_at, n.created_at, n.updated_at,
            u.display_name AS author
       FROM notices n JOIN users u ON u.id=n.author_id
      WHERE n.id=$1 ${includeDrafts ? "" : "AND n.status='PUBLISHED'"}`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listAdminNotices() {
  const result = await getDbPool().query(
    `SELECT n.id, n.title, n.body, n.status, n.published_at, n.created_at, n.updated_at,
            u.display_name AS author
       FROM notices n JOIN users u ON u.id=n.author_id
      ORDER BY n.updated_at DESC`,
  );
  return result.rows;
}

export async function createNotice(input: { title: string; body: string; authorId: string }) {
  const id = randomUUID();
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO notices (id,title,body,status,author_id) VALUES ($1,$2,$3,'DRAFT',$4)`,
      [id, input.title.trim(), input.body, input.authorId],
    );
    await audit("NOTICE_CREATED", input.authorId, "notice", id, {}, client);
  });
  return id;
}

export async function updateNotice(id: string, input: { title: string; body: string; actorId: string }) {
  assertUuid(id);
  await withTransaction(async (client) => {
    const result = await client.query("UPDATE notices SET title=$1, body=$2, updated_at=NOW() WHERE id=$3", [input.title.trim(), input.body, id]);
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
