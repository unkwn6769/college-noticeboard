import { NextResponse } from "next/server";
import { getNotice, updateNotice } from "@/src/lib/notices";
import { getCurrentUser } from "@/src/lib/auth/session";
import { assertSameOrigin, assertUuid } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime="nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { assertUuid(id); } catch { return jsonError("Invalid notice ID", 400); }
  const user = await getCurrentUser();
  const notice = await getNotice(id, !!user && ["ADMIN", "OWNER"].includes(user.role));
  return notice ? NextResponse.json({ notice }) : jsonError("Not found", 404);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || !["ADMIN", "OWNER"].includes(user.role)) return jsonError("Unauthorized", 401);
    const { id } = await context.params;
    const body = await request.json() as {
      title?: string;
      body?: string;
      department?: unknown;
      category?: unknown;
      isPinned?: unknown;
    };
    if (!body.title?.trim() || !body.body?.trim()) return jsonError("Title and body are required");
    await updateNotice(id, {
      title: body.title,
      body: body.body,
      actorId: user.id,
      department: body.department,
      category: body.category,
      isPinned: body.isPinned,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Update failed");
  }
}
