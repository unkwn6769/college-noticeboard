import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/session";
import { startLegacyScan, scannerStatus, type ScanMode } from "@/src/lib/legacy-scanner";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { await requireAdmin(); return NextResponse.json(await scannerStatus(new URL(request.url).searchParams.get("runId") ?? undefined)); }
  catch { return jsonError("Unauthorized", 401); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdmin();
    const body = await request.json() as { mode?: ScanMode };
    if (body.mode !== "DRY_RUN" && body.mode !== "IMPORT") return jsonError("mode must be DRY_RUN or IMPORT", 400);
    const runId = await startLegacyScan(user.id, body.mode);
    return NextResponse.json({ accepted: true, runId }, { status: 202 });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Unable to start scanner", 400); }
}
