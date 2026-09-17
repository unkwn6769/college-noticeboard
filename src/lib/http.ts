import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function jsonBody<T>(request: Request): Promise<T> {
  try { return (await request.json()) as T; }
  catch { throw new Error("Invalid JSON body"); }
}
