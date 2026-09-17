import { NextResponse } from "next/server";
import { publishNotice } from "@/src/lib/notices";
import { getCurrentUser } from "@/src/lib/auth/session";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
    const { id } = await context.params;
    await publishNotice(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Operation failed"); }
}
