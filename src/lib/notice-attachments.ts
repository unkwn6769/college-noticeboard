import { randomUUID } from "node:crypto";

import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertUuid } from "@/src/lib/security";

export type NoticeAttachmentRecord = {
  id: string;
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  state: "STAGING" | "ACTIVE" | "QUARANTINED" | "PURGED";
  created_at: string;
};

export async function listNoticeAttachments(
  noticeId: string,
  options: { publicOnly?: boolean } = {},
): Promise<NoticeAttachmentRecord[]> {
  assertUuid(noticeId);

  const publicOnly = options.publicOnly === true;
  const result = await getDbPool().query<NoticeAttachmentRecord>(
    `SELECT
       a.id,
       a.file_id,
       f.original_name,
       f.mime_type,
       f.size_bytes,
       f.state,
       a.created_at
     FROM notice_attachments a
     JOIN notices n ON n.id = a.notice_id
     JOIN files f ON f.id = a.file_id
     WHERE a.notice_id = $1
       ${publicOnly ? "AND n.status = 'PUBLISHED' AND f.state = 'ACTIVE'" : ""}
     ORDER BY a.created_at ASC, a.id ASC`,
    [noticeId],
  );

  return result.rows;
}

export async function attachFileToNotice(
  noticeId: string,
  fileId: string,
  actorId: string,
): Promise<string> {
  assertUuid(noticeId);
  assertUuid(fileId);
  assertUuid(actorId);

  return withTransaction(async (client) => {
    const notice = await client.query(
      `SELECT id FROM notices WHERE id = $1 FOR SHARE`,
      [noticeId],
    );
    if (notice.rowCount !== 1) throw new Error("NOTICE_NOT_FOUND");

    const file = await client.query(
      `SELECT id
         FROM files
        WHERE id = $1
          AND state = 'ACTIVE'`,
      [fileId],
    );
    if (file.rowCount !== 1) throw new Error("FILE_NOT_ACTIVE");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO notice_attachments (id, notice_id, file_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (notice_id, file_id) DO NOTHING
       RETURNING id`,
      [randomUUID(), noticeId, fileId],
    );

    if (inserted.rowCount !== 1) {
      throw new Error("NOTICE_ATTACHMENT_ALREADY_EXISTS");
    }

    const attachmentId = inserted.rows[0].id;

    await audit(
      "NOTICE_ATTACHMENT_ADDED",
      actorId,
      "notice_attachment",
      attachmentId,
      { noticeId, fileId },
      client,
    );

    return attachmentId;
  });
}

export async function detachFileFromNotice(
  noticeId: string,
  attachmentId: string,
  actorId: string,
): Promise<void> {
  assertUuid(noticeId);
  assertUuid(attachmentId);
  assertUuid(actorId);

  await withTransaction(async (client) => {
    const result = await client.query<{ file_id: string }>(
      `DELETE FROM notice_attachments
        WHERE id = $1
          AND notice_id = $2
       RETURNING file_id`,
      [attachmentId, noticeId],
    );

    if (result.rowCount !== 1) throw new Error("NOTICE_ATTACHMENT_NOT_FOUND");

    await audit(
      "NOTICE_ATTACHMENT_REMOVED",
      actorId,
      "notice_attachment",
      attachmentId,
      { noticeId, fileId: result.rows[0].file_id },
      client,
    );
  });
}
