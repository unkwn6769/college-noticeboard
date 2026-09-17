import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/src/lib/auth/session";
import { assertSameOrigin } from "@/src/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await revokeCurrentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: "cn_session", value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
