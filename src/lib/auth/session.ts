import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDbPool, withTransaction } from "@/src/lib/db/pool";
import { config } from "@/src/lib/config";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN" | "OWNER";
  status: "ACTIVE" | "DISABLED";
};

const COOKIE_NAME = "cn_session";

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export async function createSession(userId: string, response: NextResponse): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionTtlDays * 86400_000);
  await getDbPool().query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), userId, tokenHash(token), expires],
  );
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return;
  await getDbPool().query(
    "UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
    [tokenHash(token)],
  );
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const result = await getDbPool().query<SessionUser>(
    `SELECT u.id, u.email, u.display_name AS "displayName", u.role, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.status = 'ACTIVE'
      LIMIT 1`,
    [tokenHash(token)],
  );
  const user = result.rows[0] ?? null;
  if (user) {
    await getDbPool().query(
      "UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1",
      [tokenHash(token)],
    );
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER") throw new Error("UNAUTHORIZED");
  return user;
}

export async function cleanupExpiredSessions(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM sessions WHERE expires_at <= NOW() OR revoked_at < NOW() - INTERVAL '30 days'");
  });
}
