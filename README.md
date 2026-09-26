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
- Read-only full-corpus integrity verification.
- GitHub CI for tests, type checking, lint, and production build.

## Architecture invariants

PostgreSQL is the control plane and `/srv/noticeboard` is the authoritative file store. File paths are derived only from opaque storage keys. Uploads are streamed to staging, staged bytes are fsynced and verified, publication is atomic, active objects are never overwritten in place, deletion moves through quarantine before purge, and anomalous filesystem state is surfaced for reconciliation rather than blindly destroyed.

Deletion is two-phase by design and the sequence matters: the delete API records the
logical quarantine and answers `cleanupStatus: "pending"`, and `maintenance` performs the
physical move into `quarantine/objects/`. Restoring an item before maintenance has run is
correctly refused with 409.

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

## Operations

| command | purpose |
|---|---|
| `npm run maintenance` | second phase of deletion, staging sweep, filesystem/DB reconciliation. Hourly systemd timer. |
| `npm run backup:db` | compressed PostgreSQL dump, verified with `pg_restore --list`. Daily timer, 14-day retention. |
| `npm run verify:corpus` | read-only: every ACTIVE file row against the bytes on the volume. Run as the storage owner. |

`verify:corpus` is the check that makes the database a usable restore target for the existing
corpus, because the database already stores each object's size and SHA-256.

## Backups and disaster recovery

`npm run backup:db` creates a compressed PostgreSQL custom-format dump on `/srv/noticeboard/backups` and verifies the dump with `pg_restore --list`. A daily timer runs it at 03:15 UTC and retains 14 days. This provides database recoverability. It is not an independent backup of the complete file corpus; a full independent copy of a very large corpus is constrained by the available storage budget.

### Verified 2026-09-26

**Dump integrity — VALIDATED.** The most recent dump lists cleanly: `pg_restore --list` exits 0 with 96 entries and 10 tables.

**Restore — VALIDATED non-destructively.** The dump was restored into a *separate scratch
database*; the live database was only read. All 10 tables were recreated and row counts matched
exactly for `files` (47 911), `file_versions` (47 915), `notices` (2), `legacy_scanner_items`
(907) and `legacy_scanner_runs` (12). The three tables that differed — `users`, `audit_events`,
`sessions` — differed only by rows created after the 03:15 dump, which is the expected signature
of a point-in-time snapshot. The scratch database was dropped.

**Restore rehearsal through the application — VALIDATED.** Restoring cleanly does not prove the
result is *usable*, so a second instance of the built application was started against the
restored database on a spare port. It served `/`, `/departments`, `/archive`, a deep archive
path, `/search`, `/login` and `/api/health` with 200, returned 404 for an unknown path, and
downloaded a 100 023-byte PDF byte-identical in size and SHA-256 to the row in the **restored**
database. The instance was stopped and the scratch database dropped; production was unaffected
throughout.

Procedure note: `pg_restore --no-owner` leaves the restored tables owned by `postgres`, so the
application role needs `GRANT USAGE ON SCHEMA public` plus DML on the tables before it can read
restored data. Without that the instance fails with a PostgreSQL `aclcheck_error`.

**File corpus integrity — VALIDATED.** `npm run verify:corpus` checked the entire corpus:

```
activeRows 47900   verified 47900   verifiedBytes 28 200 896 231 (28.2 GB)
missing 0   sizeMismatch 0   hashMismatch 0   unreadable 0   consistent true
```

**Not covered — the largest remaining exposure.** There is no independent off-host copy of the
file corpus. Measured: `/srv/noticeboard` is a 63 GB volume holding the 27 GB corpus with 33 GB
free, and the OS volume has 7.6 GB free. A duplicate does not fit off-volume, and a second copy
on the same volume would consume the headroom the live volume needs while protecting against
nothing. **Losing `/srv/noticeboard` is not recoverable from anything in this repository.** A
restore against the live database was deliberately not attempted; the isolated rehearsal above
is the safe equivalent.

See `P10_CLOSEOUT.md` for the full evidence.
