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
    try {
      await markDeleted(id, user.id);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "FILE_NOT_FOUND") return jsonError("File not found", 404);
      if (code === "FILE_NOT_ACTIVE") return jsonError("File is not active and cannot be deleted again", 409);
      throw error;
    }
    return NextResponse.json({ ok: true, state: "QUARANTINED", cleanupStatus: "pending" });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid ID") return jsonError("Invalid file ID", 400);
    if (error instanceof Error && error.message === "Origin check failed") return jsonError("Origin check failed", 400);
    return jsonError(error instanceof Error ? error.message : "Delete failed", 400);
  }
}
