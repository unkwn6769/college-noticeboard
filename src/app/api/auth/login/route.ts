import { NextResponse } from "next/server";
import { verifyPassword } from "@/src/lib/auth/password";
import { createSession } from "@/src/lib/auth/session";
import { getDbPool } from "@/src/lib/db/pool";
import { audit } from "@/src/lib/audit";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const result = await getDbPool().query(
      `SELECT id, email, password_hash, display_name, role, status FROM users WHERE email=$1 LIMIT 1`, [email],
    );
    const user = result.rows[0];
    if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.password_hash))) {
      await audit("AUTHORIZATION_FAILURE", user?.id ?? null, "auth", null, { reason: "invalid_login" });
      return jsonError("Invalid email or password", 401);
    }
    const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
    await createSession(user.id, response);
    await getDbPool().query("UPDATE users SET last_login_at=NOW(), updated_at=NOW() WHERE id=$1", [user.id]);
    await audit("USER_LOGIN", user.id, "user", user.id);
    return response;
  } catch (error) {
    return jsonError(error instanceof Error && error.message === "Origin check failed" ? error.message : "Login failed", 400);
  }
}
