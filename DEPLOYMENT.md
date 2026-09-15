# College Noticeboard — Cloudflare Deployment

This release uses a Cloudflare-native application path:

```text
Browser
  -> Cloudflare Pages (React/Vite)
  -> Cloudflare Worker (Express API)
     -> Hyperdrive -> Supabase PostgreSQL
     -> Google APIs

Admin migration actions
  -> GitHub Actions disposable runners
  -> direct Supabase PostgreSQL state
  -> Google Drive server-side files.copy()
```

The Node server remains available for local development and compatibility testing. It is not required as a separate production service for the Cloudflare deployment.

## Cloudflare resources

The Worker configuration expects these existing resources:

- Worker: `college-noticeboard-api`
- Pages project: `college-noticeboard-final`

For a different Cloudflare account, use that account’s Worker and Pages resources. Hyperdrive may remain enabled for normal Worker application DB access; it is intentionally not used by migration runners.

## First-time bootstrap deployment

Create a local `.env` from `.env.example` and fill in the real values. `.env` is deliberately excluded from the release ZIP.

Log in:

```bash
npx wrangler login --use-keyring
```

Then run:

```bash
./scripts/deploy-cloudflare.sh
```

The script first publishes the Worker so it can determine the final `workers.dev` hostname. It then stops before secret upload if the Google OAuth redirect URIs in `.env` do not match that hostname.

Set these two values in `.env` to the printed Worker URL:

```text
ADMIN_GOOGLE_REDIRECT_URI=https://<worker-host>/api/admin/auth/google/callback
DRIVE_ACCOUNT_GOOGLE_REDIRECT_URI=https://<worker-host>/api/admin/accounts/google/callback
```

Add the same two callback URLs to the corresponding Google OAuth client configurations. Then rerun the deployment script.

The script bulk-uploads the Worker secrets, builds the frontend with the Worker URL as `VITE_API_URL`, creates the Pages project when needed, and deploys `dist/` to Pages. This is a bootstrap/local-admin path; after GitHub is configured, `.github/workflows/deploy.yml` is the canonical deployment path.

## Required Worker secrets

The script uploads only these secret values:

- `TOKEN_ENCRYPTION_KEY`
- `ADMIN_GOOGLE_CLIENT_ID`
- `ADMIN_GOOGLE_CLIENT_SECRET`
- `ADMIN_GOOGLE_REDIRECT_URI`
- `ADMIN_SESSION_SECRET`
- `DRIVE_ACCOUNT_GOOGLE_CLIENT_ID`
- `DRIVE_ACCOUNT_GOOGLE_CLIENT_SECRET`
- `DRIVE_ACCOUNT_GOOGLE_REDIRECT_URI`

`DATABASE_URL` is used by local Node execution and GitHub Actions migration runners. The Worker control-plane API uses the Hyperdrive binding to reach Supabase PostgreSQL; Hyperdrive is not part of the migration execution hot path.

## Public configuration

`cloudflare/api/wrangler.jsonc` contains non-secret production configuration:

- `FRONTEND_URL=https://college-noticeboard-final-343.pages.dev`
- `ALLOWED_ORIGINS=https://college-noticeboard-final-343.pages.dev`
- `GOOGLE_DRIVE_HTTP2=true`
- `NODE_ENV=production`

## Migration execution

Creating a migration inserts all migration items transactionally. GitHub Actions discovers runnable migrations from PostgreSQL on its scheduled/manual trigger and executes them independently of the browser.

Runner discovery and execution use the migration/item rows directly. Cloudflare Queue is not part of this path.

The migration engine keeps its durable PostgreSQL retry/reconciliation state. Source cleanup performs the target-file, migration-marker, and application-mapping safety checks before deleting a source.

GitHub-hosted runners are disposable: a runner may disappear at any point, and the next execution discovers durable state and reclaims expired work using lease generation/fencing.


## Validation

Static validation:

```bash
./scripts/verify-final.sh
```

Full development validation:

```bash
npm install
npm run lint
npm run build
npm test

cd cloudflare/api
npm install
npx wrangler types
npx tsc --noEmit
npm test
npx wrangler deploy --dry-run
```

Do not run the Node integration test suite against a production database without understanding its fixtures and cleanup behavior.

## Security

Never commit or package:

- `.env`
- `.dev.vars`
- OAuth client secrets
- Google refresh tokens
- database passwords
- encryption keys

Cloudflare recommends Wrangler secrets for sensitive Worker configuration rather than storing secrets in the Wrangler configuration or source.

## Migration execution engine

Production migrations do not execute in Cloudflare Workers or the Cloudflare request path. The Worker exposes the application/control-plane API only. GitHub Actions discovers runnable migrations from Supabase PostgreSQL and launches disposable runners. Each runner executes the existing Node migration engine directly against PostgreSQL and Google Drive, with durable item leases/fencing and bounded adaptive concurrency. The browser and a local machine are never required to remain connected.

Configure these GitHub repository secrets before enabling deployment/migration workflows:

- `SUPABASE_DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_API_URL`

Do not store OAuth tokens, database passwords, or encryption keys in the repository.
