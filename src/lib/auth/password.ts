import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const N = 32768;
const r = 8;
const p = 1;
const MAXMEM = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      { ...options, maxmem: MAXMEM },
      (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) throw new Error("Password must contain at least 10 characters");
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltHex, keyHex] = parts;
  const n = Number(nRaw);
  const costR = Number(rRaw);
  const costP = Number(pRaw);
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (!salt.length || expected.length !== KEY_LENGTH) return false;
  const actual = await deriveKey(password, salt, { N: n, r: costR, p: costP });
  return timingSafeEqual(actual, expected);
}
