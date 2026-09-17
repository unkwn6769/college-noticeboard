# Foundation / V1 status

The original architecture used OCI Always Free. The actual environment for this rebuild is Azure for Students. This is an infrastructure substitution, not an application architecture change.

Implemented V1 layers:

1. Next.js application shell and routes.
2. PostgreSQL schema and access layer.
3. Storage engine with staging, hashing, fsync, atomic publication, verification, quarantine, purge, scans and disk pressure.
4. Authentication and authorization.
5. Notice APIs and UI.
6. File upload/download/replacement/delete APIs and admin UI.
7. Audit log.
8. Maintenance/reconciliation command.
9. Daily local PostgreSQL backup command.
10. Azure/systemd/Nginx deployment material.
11. GitHub CI.
