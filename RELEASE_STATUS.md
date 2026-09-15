# Release Status

## Architecture

Production target is Cloudflare application path with GitHub Actions migration execution:

- Cloudflare Pages hosts the Vite/React frontend.
- Cloudflare Worker hosts the Express API through `httpServerHandler`.
- Hyperdrive provides the PostgreSQL connection path for the normal Worker/control-plane API only; GitHub Actions migration runners connect to Supabase PostgreSQL directly.
- GitHub Actions drives migration work and administrative source-cleanup retries.
- Google Drive remains the file-storage integration.

The Node server remains available for local development and regression tests.

## Verification status

- Static/syntax/repository verification: passed in this environment.
- Dependency-backed build/test/Wrangler verification: requires a networked environment; not claimed as reproduced here.

## Release checks added

- request-scoped Hyperdrive DB context for the control-plane API
- dedicated PostgreSQL sessions for `pool.connect()` transactions
- GitHub Actions migration kickoff/discovery
- GitHub Actions source-cleanup retry execution
- target/migration-marker/application-mapping cleanup safety checks
- bulk secret deployment
- direct Pages upload deployment
- secret-free release packaging

## Deployment prerequisite

The Google OAuth clients must contain the final Worker callback URLs before administrator sign-in and Drive-account connection can work in production.

## Final Migration Architecture (2026-09-15)

Production migration execution is PostgreSQL-controlled and GitHub Actions-driven:

Cloudflare Pages → Cloudflare Worker (application/control-plane API only) → Supabase PostgreSQL → GitHub Actions disposable runners → bounded adaptive scheduler/worker pool → Google Drive API server-side `files.copy()` → target Drive.

The browser and a local machine are not required for migration execution. Durable item leases, lease generation/fencing, retry state, uncertain-copy reconciliation, target verification/mapping, source cleanup gating, and child-derived parent finalization remain in PostgreSQL/Node migration code.

The repository passes static/syntax validation in this environment. Dependency-backed build/test/deploy execution requires external network access and repository/provider secrets; those have not been fabricated or claimed as executed here.

## Final migration architecture boundary
- Cloudflare Pages hosts the React/Vite frontend.
- Cloudflare Worker provides application/control-plane APIs only.
- The Worker may use Hyperdrive for ordinary application PostgreSQL access.
- Supabase PostgreSQL is the authoritative migration control plane.
- GitHub Actions disposable runners are the migration execution engine.
- Migration runners connect directly to `SUPABASE_DATABASE_URL` and do not use Cloudflare Queue or Hyperdrive.
- The transfer path is Google Drive server-side `files.copy()` from source Drive to target Drive.
- Copy outcomes are reconciled before retry; target verification and durable mapping precede source deletion.
