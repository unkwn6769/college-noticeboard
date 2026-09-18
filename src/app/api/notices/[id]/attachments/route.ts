import { NextResponse } from "next/server";

import { getCurrentUser } from "@/src/lib/auth/session";
import { assertSameOrigin, assertUuid } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";
import {
  attachFileToNotice,
  listNoticeAttachments,
} from "@/src/lib/notice-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "OWNER";
}

function knownErrorStatus(message: string): number {
  if (message === "NOTICE_NOT_FOUND") return 404;
  if (message === "NOTICE_ATTACHMENT_ALREADY_EXISTS") return 409;
  if (message === "FILE_NOT_ACTIVE") return 409;
  return 400;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdminRole(user.role)) return jsonError("Unauthorized", 401);

    const { id } = await context.params;
    assertUuid(id);

    return NextResponse.json({
      attachments: await listNoticeAttachments(id, { publicOnly: false }),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to load attachments",
      400,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);

    const user = await getCurrentUser();
    if (!user || !isAdminRole(user.role)) return jsonError("Unauthorized", 401);

    const { id } = await context.params;
    assertUuid(id);

    const body = (await request.json()) as { fileId?: unknown };
    if (typeof body.fileId !== "string" || !body.fileId.trim()) {
      return jsonError("fileId is required", 400);
    }

    assertUuid(body.fileId);

    const attachmentId = await attachFileToNotice(id, body.fileId, user.id);

    return NextResponse.json({ attachmentId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to attach file";
    return jsonError(message, knownErrorStatus(message));
  }
}
