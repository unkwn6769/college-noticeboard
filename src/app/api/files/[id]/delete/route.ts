import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { markDeleted } from "@/src/lib/files";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
    const { id } = await context.params;
    await markDeleted(id, user.id);
    return NextResponse.json({ ok: true, state: "QUARANTINED", cleanupStatus: "pending" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Delete failed", 400);
  }
}
