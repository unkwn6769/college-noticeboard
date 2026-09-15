# College Noticeboard

## Migration Architecture

Migrations are executed by disposable GitHub Actions runners. The Cloudflare Worker is the application/control-plane API only. After a migration is committed, it schedules the GitHub workflow dispatch as Worker background work so the browser response does not block on GitHub; the five-minute workflow remains only as a recovery sweep. Supabase PostgreSQL is the authoritative migration state store. The migration runner uses durable PostgreSQL leases and fencing, a bounded adaptive worker pool, Google Drive server-side `files.copy()`, target reconciliation/verification, and independently retryable source cleanup. Cloudflare Queue and Hyperdrive are not part of the migration execution hot path.

Required GitHub Actions secrets:

- `SUPABASE_DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_API_URL`

Required Worker runtime values for immediate migration dispatch:

- `GITHUB_TOKEN` (secret)
- `GITHUB_REPOSITORY` (public runtime value or env var)
- `MIGRATION_GITHUB_WORKFLOW` (defaults to `migrations.yml`)

Never commit real secrets.
