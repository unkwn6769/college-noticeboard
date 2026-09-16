# Phase 1 — Foundation

## Status

Started.

## Deliberate decisions

- One Next.js/Node.js application.
- PostgreSQL is the application control plane.
- The OCI Block Volume is the authoritative file store.
- Storage access is behind one `StorageEngine`.
- No migration subsystem exists.
- No distributed queue/worker infrastructure exists.

## Remaining Phase 1 work

- OCI VM provisioning
- VCN/subnet/security rules
- 50 GB boot + 150 GB block volume
- Ubuntu LTS setup
- SSH hardening
- `/srv/noticeboard` mount
- PostgreSQL installation and role/database creation
- systemd service definitions
- Nginx reverse proxy
- Cloudflare DNS/proxy/TLS configuration

These require access to the actual OCI tenancy and should not be fabricated locally.
