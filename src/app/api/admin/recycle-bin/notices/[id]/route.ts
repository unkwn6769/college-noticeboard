import { NextResponse } from "next/server";
import { restoreNotice, permanentlyDeleteNotice } from "@/src/lib/notices";
import { requireAdmin } from "@/src/lib/auth/session";
import { assertSameOrigin, assertUuid } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const { id } = await context.params;
    try { assertUuid(id); } catch { return jsonError("Invalid notice ID", 400); }
    await restoreNotice(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }
    if (error instanceof Error && error.message === "NOTICE_NOT_IN_RECYCLE_BIN") {
      return jsonError("Notice not in recycle bin", 404);
    }
    return jsonError(error instanceof Error ? error.message : "Restore failed");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const { id } = await context.params;
    try { assertUuid(id); } catch { return jsonError("Invalid notice ID", 400); }
    await permanentlyDeleteNotice(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }
    if (error instanceof Error && error.message === "NOTICE_NOT_IN_RECYCLE_BIN") {
      return jsonError("Notice not in recycle bin", 404);
    }
    return jsonError(error instanceof Error ? error.message : "Permanent delete failed");
  }
}
