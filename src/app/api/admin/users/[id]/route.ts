import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getDbPool } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError, publicErrorMessage } from "@/src/lib/http";
import { isUserRole, isUuid } from "@/src/lib/user-validation";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || actor.role !== "OWNER") return jsonError("Owner privileges required", 403);
    const { id } = await context.params;
    if (!isUuid(id)) return jsonError("Invalid user ID", 400);
    const body = (await request.json()) as { status?: "ACTIVE"|"DISABLED"; role?: "USER"|"ADMIN"|"OWNER" };
    if (body.status !== undefined && body.status !== "ACTIVE" && body.status !== "DISABLED") return jsonError("Status must be ACTIVE or DISABLED");
    if (body.role !== undefined && !isUserRole(body.role)) return jsonError("Role must be USER, ADMIN or OWNER");
    if (body.role === "OWNER" || id === actor.id && body.status === "DISABLED") return jsonError("Protected account operation");

    const updated = await getDbPool().query(
      `UPDATE users SET status=COALESCE($1,status), role=COALESCE($2,role), updated_at=NOW() WHERE id=$3 RETURNING id`,
      [body.status ?? null, body.role ?? null, id],
    );
    // A mutation against an unknown user must not report success or leave an
    // audit record claiming an account was changed.
    if (updated.rowCount !== 1) return jsonError("User not found", 404);
    await audit("ADMIN_ACTION", actor.id, "user", id, { action: "update", ...body });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(publicErrorMessage(error, "User could not be updated. Please try again."), 400); }
}
