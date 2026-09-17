import pg from "pg";
import { randomUUID, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_NAME ?? "Administrator";
if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
const salt = randomBytes(16); const derived = await scrypt(password, salt, 64, { N:32768, r:8, p:1 });
const encoded = `scrypt$32768$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`INSERT INTO users (id,email,password_hash,display_name,role) VALUES ($1,$2,$3,$4,'OWNER') ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, display_name=EXCLUDED.display_name, status='ACTIVE'`, [randomUUID(), email.trim(), encoded, displayName.trim()]);
  console.log(`Admin account ready: ${email}`);
} finally { await client.end(); }
