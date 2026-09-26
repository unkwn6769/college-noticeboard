import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/src/lib/auth/session";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // Sign-out is a state change, so it takes the same origin check as every
    // other mutation. Left uncaught, a rejected cross-origin sign-out became an
    // unhandled 500 and wrote a stack trace to the service log for what is an
    // ordinary rejected request.
    assertSameOrigin(request);
  } catch {
    return jsonError("Origin check failed", 400);
  }
  await revokeCurrentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: "cn_session", value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
