import { NextResponse } from "next/server";
import { getDbPool } from "@/src/lib/db/pool";
import { getStorageEngine } from "@/src/lib/storage/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await getDbPool().query("SELECT 1");
    checks.postgresql = "ok";
  } catch {
    checks.postgresql = "error";
    ok = false;
  }

  try {
    const storage = getStorageEngine();
    const stats = await storage.getDiskStats();
    checks.storageRoot = "ok";
    checks.storageWritable = String(stats.writable);
    checks.diskUsagePercent = stats.usagePercent.toFixed(2);
    if (stats.usagePercent >= 95) ok = false;
  } catch {
    checks.storageRoot = "error";
    ok = false;
  }

  return NextResponse.json(
    { ok, checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
