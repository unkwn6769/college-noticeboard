import { Readable } from "node:stream";

import { getDbPool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getStorageEngine } from "@/src/lib/storage/engine";
import { assertUuid } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";
import { getDownloadPermission } from "@/src/lib/file-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    assertUuid(id);

    const result = await getDbPool().query<{
      storage_key: string;
      mime_type: string;
      original_name: string;
      size_bytes: string;
      state: "ACTIVE";
      origin_type: "USER_UPLOAD" | "LEGACY_IMPORT";
    }>(
      `SELECT storage_key,mime_type,original_name,size_bytes,state,origin_type
       FROM files
       WHERE id=$1 AND state='ACTIVE'
       LIMIT 1`,
      [id],
    );

    const row = result.rows[0];
    if (!row) return jsonError("File not found", 404);

    const permission = getDownloadPermission(row, user);
    if (permission === "DENIED") {
      return jsonError(user ? "Forbidden" : "Unauthorized", user ? 403 : 401);
    }

    const opened = await getStorageEngine().openReadStream(row.storage_key);
    const stream =
      Readable.toWeb(opened.stream) as unknown as ReadableStream<Uint8Array>;

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": row.mime_type,
        "Content-Length": row.size_bytes,
        "Content-Disposition": `${permission === "PUBLIC" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
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
