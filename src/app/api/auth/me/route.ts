import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
