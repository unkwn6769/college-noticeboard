import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/src/lib/auth/password";
import { getCurrentUser } from "@/src/lib/auth/session";
import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError, publicErrorMessage } from "@/src/lib/http";
import {
  isUserRole,
  isValidEmail,
  MAX_DISPLAY_NAME_LENGTH,
} from "@/src/lib/user-validation";
export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  // User administration is owner-only: hiding the nav entry is not authorization.
  if (user.role !== "OWNER") return jsonError("Owner privileges required", 403);
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
    const email = body.email.trim().toLowerCase();
    const password = body.password;
    const displayName = body.displayName.trim();
    if (!email || !password || !displayName) return jsonError("Missing fields");
    if (!isValidEmail(email)) return jsonError("Enter a valid email address");
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) return jsonError(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`);
    if (body.role !== undefined && !isUserRole(body.role)) return jsonError("Role must be USER, ADMIN or OWNER");
    if (body.role === "OWNER" && actor.role !== "OWNER") return jsonError("Owner privileges required", 403);
    const id = randomUUID();
    const hash = await hashPassword(password);
    const role = body.role ?? "USER";
    try {
      await withTransaction(async (client) => {
        await client.query(`INSERT INTO users (id,email,password_hash,display_name,role) VALUES ($1,$2,$3,$4,$5)`, [id, email, hash, displayName, role]);
        await audit("ADMIN_ACTION", actor.id, "user", id, { action: "create", role }, client);
      });
    } catch (error) {
      // Surface a readable conflict instead of the constraint name.
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505") {
        return jsonError("A user with this email already exists", 409);
      }
      throw error;
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return jsonError(publicErrorMessage(error, "User could not be created. Please try again."), 400); }
}
