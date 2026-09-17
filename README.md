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

This rebuild is prepared for the existing Azure for Students VM. See `infra/azure/README.md`. The hosting provider differs from the original OCI target, but the application/storage architecture remains unchanged.

## Backups and disaster recovery

`npm run backup:db` creates a compressed PostgreSQL custom-format dump on `/srv/noticeboard/backups` and verifies the dump with `pg_restore --list`. This provides database recoverability. It is not an independent backup of the complete file corpus; a full independent copy of a very large corpus is constrained by the available storage budget.
