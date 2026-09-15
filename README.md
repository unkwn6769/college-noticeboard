# College Noticeboard

## Migration Architecture

Migrations are executed by disposable GitHub Actions runners. The Cloudflare Worker is the application/control-plane API only. Supabase PostgreSQL is the authoritative migration state store. The migration runner uses durable PostgreSQL leases and fencing, a bounded adaptive worker pool, Google Drive server-side `files.copy()`, target reconciliation/verification, and independently retryable source cleanup. Cloudflare Queue and Hyperdrive are not part of the migration execution hot path.

Required GitHub Actions secrets:

- `SUPABASE_DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_API_URL`

Never commit real secrets.
