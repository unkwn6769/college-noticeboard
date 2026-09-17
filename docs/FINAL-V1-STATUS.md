# Functional V1 Status

This package contains the rebuilt College Noticeboard V1 application using the current architecture contract.

## Included

- Next.js application and public noticeboard UI.
- PostgreSQL schema and application access layer.
- Password hashing and database-backed sessions.
- Role-based authorization for USER, ADMIN, and OWNER.
- Notice creation, editing, publishing, archiving, and search.
- Streaming file upload with SHA-256, staging, fsync, atomic publication, verification, and path-independent storage keys.
- Safe authenticated file download.
- Version-aware replacement without overwriting a valid object in place.
- Logical deletion followed by maintenance-driven quarantine and retention-based purge.
- Disk-pressure classification and upload capacity checks.
- Filesystem/DB reconciliation and corruption inspection in maintenance.
- Audit logging.
- Health endpoint.
- Azure/systemd/Nginx deployment material.
- Daily PostgreSQL backup command and timer.
- GitHub CI workflow.

## Architecture exclusions

The active application does not use Google Drive, migration state machines, migration queues/workers, Redis, Kubernetes, Cloudflare Workers for the filesystem, or external primary file storage.

## Validation status

The package has been statically checked in the build environment:

- Node `.mjs` syntax checks: passed.
- TypeScript/TSX syntax parsing: passed for active source files.
- Storage-engine and password smoke checks: patched against the reported failures.
- `git diff --check`: passed.

The container cannot complete the repository's full npm toolchain because dependency installation is unavailable here. Therefore this ZIP does **not** claim that `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` were executed successfully after the final fixes. Run those four commands on the Mac before deployment; they are the final verification gate.

## Deployment note

The original architecture specified OCI, but this rebuild is prepared for the actual Azure for Students VM. The authoritative application/storage design is unchanged; only the hosting configuration differs.
