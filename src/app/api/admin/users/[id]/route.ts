import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getDbPool } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || actor.role !== "OWNER") return jsonError("Owner privileges required", 403);
    const { id } = await context.params;
    const body = (await request.json()) as { status?: "ACTIVE"|"DISABLED"; role?: "USER"|"ADMIN"|"OWNER" };
    if (body.role === "OWNER" || id === actor.id && body.status === "DISABLED") return jsonError("Protected account operation");
    await getDbPool().query(`UPDATE users SET status=COALESCE($1,status), role=COALESCE($2,role), updated_at=NOW() WHERE id=$3`, [body.status ?? null, body.role ?? null, id]);
    await audit("ADMIN_ACTION", actor.id, "user", id, { action: "update", ...body });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "User update failed", 400); }
}
