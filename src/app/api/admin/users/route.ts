import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/src/lib/auth/password";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";
export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) return jsonError("Unauthorized", 401);
  const result = await getDbPool().query(`SELECT id,email,display_name AS "displayName",role,status,created_at,last_login_at FROM users ORDER BY created_at DESC`);
  return NextResponse.json({ users: result.rows });
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || actor.role !== "OWNER") return jsonError("Owner privileges required", 403);
    const body = (await request.json()) as { email?: string; password?: string; displayName?: string; role?: "USER"|"ADMIN"|"OWNER" };
    if (typeof body.email !== "string" || typeof body.password !== "string" || typeof body.displayName !== "string") return jsonError("Missing fields");
    const email = body.email.trim();
    const password = body.password;
    const displayName = body.displayName.trim();
    if (!email || !password || !displayName) return jsonError("Missing fields");
    if (body.role === "OWNER" && actor.role !== "OWNER") return jsonError("Owner privileges required", 403);
    const id = randomUUID();
    const hash = await hashPassword(password);
    const role = body.role ?? "USER";
    await withTransaction(async (client) => {
      await client.query(`INSERT INTO users (id,email,password_hash,display_name,role) VALUES ($1,$2,$3,$4,$5)`, [id, email, hash, displayName, role]);
      await audit("ADMIN_ACTION", actor.id, "user", id, { action: "create", role }, client);
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "User creation failed", 400); }
}
