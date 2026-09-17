import { NextResponse } from "next/server";
import { createNotice, listAdminNotices, listPublishedNotices } from "@/src/lib/notices";
import { getCurrentUser } from "@/src/lib/auth/session";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin") === "1";
  if (admin) {
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
    return NextResponse.json({ notices: await listAdminNotices() });
  }
  return NextResponse.json({ notices: await listPublishedNotices(url.searchParams.get("q") ?? "") });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
    const body = (await request.json()) as { title?: string; body?: string };
    if (!body.title?.trim() || !body.body?.trim()) return jsonError("Title and body are required");
    const id = await createNotice({ title: body.title, body: body.body, authorId: user.id });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Create failed"); }
}
