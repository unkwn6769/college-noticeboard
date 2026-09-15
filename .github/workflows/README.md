# GitHub Actions setup

Required repository secrets for deployment: `SUPABASE_DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_API_URL`, `ADMIN_GOOGLE_CLIENT_ID`, `ADMIN_GOOGLE_CLIENT_SECRET`, `ADMIN_GOOGLE_REDIRECT_URI`, `ADMIN_SESSION_SECRET`, `DRIVE_ACCOUNT_GOOGLE_CLIENT_ID`, `DRIVE_ACCOUNT_GOOGLE_CLIENT_SECRET`, and `DRIVE_ACCOUNT_GOOGLE_REDIRECT_URI`.

`Migration Engine` is the production migration executor. It reads durable migration state from Supabase PostgreSQL and runs disposable GitHub-hosted runners.

Migration execution uses direct `SUPABASE_DATABASE_URL` access from disposable GitHub runners. Set the optional repository variable `MIGRATION_MAX_PARALLEL` to bound simultaneous migration jobs; the per-run worker pool is adaptive via `MIGRATION_MIN_WORKERS`/`MIGRATION_MAX_WORKERS`. Hyperdrive and Cloudflare Queue are not used by the migration executor.
