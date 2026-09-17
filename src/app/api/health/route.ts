import { NextResponse } from "next/server";
import { getDbPool } from "@/src/lib/db/pool";
import { getStorageEngine } from "@/src/lib/storage/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string | number> = {};
  let ok = true;
  try { await getDbPool().query("SELECT 1"); checks.postgresql = "ok"; }
  catch { checks.postgresql = "error"; ok = false; }
  try {
    const stats = await getStorageEngine().getDiskStats();
    checks.storageRoot = "ok";
    checks.storageWritable = String(stats.writable);
    checks.diskUsagePercent = Number(stats.usagePercent.toFixed(2));
    checks.diskPressure = stats.pressure;
    if (stats.pressure === "EMERGENCY") ok = false;
  } catch { checks.storageRoot = "error"; ok = false; }
  return NextResponse.json(
    { ok, checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
