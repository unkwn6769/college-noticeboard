import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/src/lib/auth/session";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { getDbPool } from "@/src/lib/db/pool";
import { assertSameOrigin, assertUuid } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";
import { detachFileFromNotice } from "@/src/lib/notice-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    assertSameOrigin(request);

    const user = await getCurrentUser();
    if (!user || !isAdminRole(user.role)) return jsonError("Unauthorized", 401);

    const { id, attachmentId } = await context.params;
    assertUuid(id);
    assertUuid(attachmentId);

    await detachFileFromNotice(id, attachmentId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove attachment";
    return jsonError(message, message === "NOTICE_ATTACHMENT_NOT_FOUND" ? 404 : 400);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const { id, attachmentId } = await context.params;
    assertUuid(id);
    assertUuid(attachmentId);

    const result = await getDbPool().query<{
      storage_key: string;
      mime_type: string;
      original_name: string;
      size_bytes: string;
    }>(
      `SELECT
         f.storage_key,
         f.mime_type,
         f.original_name,
         f.size_bytes
       FROM notice_attachments a
       JOIN notices n ON n.id = a.notice_id
       JOIN files f ON f.id = a.file_id
       WHERE a.id = $1
         AND a.notice_id = $2
         AND n.status = 'PUBLISHED'
         AND f.state = 'ACTIVE'
       LIMIT 1`,
      [attachmentId, id],
    );

    const row = result.rows[0];
    if (!row) return jsonError("Attachment not found", 404);

    const opened = await getStorageEngine().openReadStream(row.storage_key);
    const stream = Readable.toWeb(opened.stream) as unknown as ReadableStream<Uint8Array>;

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": row.mime_type,
        "Content-Length": row.size_bytes,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Download failed",
      400,
    );
  }
}
