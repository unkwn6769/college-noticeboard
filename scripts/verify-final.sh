#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Node syntax =="
while IFS= read -r -d '' file; do
  node --check "$file" >/dev/null
  echo "OK  $file"
done < <(find server -type f -name '*.js' -print0 | sort -z)

echo "== Project configuration =="
node --input-type=module <<'NODE'
import fs from 'node:fs';
for (const file of ['package.json','server/package.json','cloudflare/api/package.json','cloudflare/api/wrangler.jsonc']) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`OK  ${file}`);
}
NODE

echo "== Deployment script syntax =="
bash -n scripts/deploy-cloudflare.sh
echo "OK  scripts/deploy-cloudflare.sh"

echo "== Secret exclusion =="
if find . -path './.git' -prune -o -type f \( -name '.env' -o -name '.env.local' \) -print | grep -q .; then
  echo "FAIL: real environment file found in project"
  exit 1
fi
echo "OK  no real .env files"


echo "== Final migration architecture assertions =="
python3 - <<'PY2'
from pathlib import Path

wrangler = Path("cloudflare/api/wrangler.jsonc").read_text()
migrations = Path(".github/workflows/migrations.yml").read_text()
executor = Path("server/migrationExecutor.js").read_text()
copy = Path("server/migrationDriveCopy.js").read_text()
worker = Path("server/migrationWorker.js").read_text()

def require(text, needle, label):
    if needle not in text:
        raise SystemExit(f"FAIL: missing {label}: {needle}")
    print(f"OK  {label}")

require(wrangler, '"hyperdrive"', "control-plane Hyperdrive binding")
require(migrations, 'SUPABASE_DATABASE_URL', "direct Supabase migration runner database secret")
require(migrations, 'MIGRATION_MAX_WORKERS: "64"', "adaptive worker ceiling configuration")
if 'HYPERDRIVE' in migrations or 'Cloudflare Queue' in migrations:
    raise SystemExit("FAIL: migration workflow references Hyperdrive/Cloudflare Queue")
if 'runWithRuntimeContext' in executor or 'HYPERDRIVE' in executor:
    raise SystemExit("FAIL: migration executor depends on Worker runtime/Hyperdrive")
require(copy, 'files.copy', "Google Drive server-side copy")
require(copy, 'MIGRATION_SERVER_SIDE_COPY', "server-side-copy enforcement")
if 'fetch(' in copy and 'files.copy' not in copy:
    raise SystemExit("FAIL: Drive copy implementation missing files.copy")
require(worker, "status IN ('pending', 'reconciling')", "atomic migration item claim states")
require(worker, 'target_recovery_required', "target recovery/reconciliation state")
print("OK  migration hot path is GitHub Actions -> PostgreSQL -> Google Drive")
PY2

echo "All static checks passed. Run npm install/build/test on a networked development machine for dependency-backed verification."
