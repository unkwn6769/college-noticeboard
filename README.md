# College Noticeboard — Functional V1

A self-hosted college noticeboard built around Next.js, PostgreSQL, and filesystem storage behind one storage engine. The production architecture does not use Google Drive, migration queues/workers, Redis, Kubernetes, or external primary file storage.

## V1 capabilities

- Public noticeboard with search and notice detail pages.
- Session-based authentication with hashed session tokens and role-based authorization.
- Admin notice creation, editing, publishing, archiving, audit history, and owner-managed users.
- Streaming file upload with SHA-256 verification, safe download, versioned replacement, quarantine, and retention-based purge.
- Disk-pressure policy and storage health.
- Lightweight reconciliation and maintenance through systemd timer.
- Daily compressed PostgreSQL backup to the mounted storage volume.
- GitHub CI for tests, type checking, lint, and production build.

## Architecture invariants

PostgreSQL is the control plane and `/srv/noticeboard` is the authoritative file store. File paths are derived only from opaque storage keys. Uploads are streamed to staging, staged bytes are fsynced and verified, publication is atomic, active objects are never overwritten in place, deletion moves through quarantine before purge, and anomalous filesystem state is surfaced for reconciliation rather than blindly destroyed.

## Local development

```bash
npm install
cp .env.example .env
# set DATABASE_URL and NOTICEBOARD_STORAGE_ROOT
npm run db:init
npm run admin:create
npm run dev
```

Open `http://localhost:3000`.

The first owner can be created with:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='change-me-now' ADMIN_NAME='Noticeboard Owner' npm run admin:create
```

## File upload protocol

The file API accepts a raw request body so large files can remain streamed rather than buffered as a complete in-memory object. Clients send `X-File-Name`, `X-File-Size`, and `Content-Type`. The server checks authorization, configured size limits, disk headroom, staging, SHA-256, fsync, atomic publication, final verification, and the short PostgreSQL metadata transaction.

## Production deployment

This rebuild is prepared for the existing Azure for Students VM. See `infra/azure/README.md`, which records the runtime, the TLS state and the first-time setup. The hosting provider differs from the original OCI target, but the application/storage architecture remains unchanged.

`infra/azure/nginx.conf` mirrors the site configuration that is installed on the VM. The
application itself is deployed with `npm run build` followed by
`systemctl restart college-noticeboard.service`.

## Backups and disaster recovery

`npm run backup:db` creates a compressed PostgreSQL custom-format dump on `/srv/noticeboard/backups` and verifies the dump with `pg_restore --list`. A daily timer runs it at 03:15 UTC and retains 14 days. This provides database recoverability. It is not an independent backup of the complete file corpus; a full independent copy of a very large corpus is constrained by the available storage budget.

Restore is verified non-destructively rather than assumed. The procedure below was run on 2026-09-26 against the dump of that morning: the dump listed cleanly, it was restored into a **separate scratch database** (the live database was only read), all 10 tables were recreated, and row counts matched exactly for `files` (47 911), `file_versions` (47 915), `notices` (2), `legacy_scanner_items` (907) and `legacy_scanner_runs` (12). The three tables that differed — `users`, `audit_events` and `sessions` — differed only by rows this verification session itself created after 03:15, which is the expected behaviour of a point-in-time snapshot. The scratch database was then dropped.

Separately, 400 randomly sampled `ACTIVE` file rows were checked against the bytes on the
authoritative volume: every one matched its recorded size and SHA-256, with none missing. So a
database restore is meaningful as long as `/srv/noticeboard` survives.

**Not verified:** a full environment restore in which the application is pointed at a restored
database, and any independent backup of the file corpus. Recovering from the loss of
`/srv/noticeboard` itself is not covered by anything in this repository.
