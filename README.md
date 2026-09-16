# College Noticeboard

Clean rebuild based on the Final Architecture & Implementation Handoff.

## Target

- Next.js + Node.js
- PostgreSQL
- OCI Always Free A1 Flex VM
- OCI Block Volume at `/srv/noticeboard`
- Nginx
- Cloudflare DNS / proxy / TLS
- GitHub for source control and CI
- systemd for process supervision
- $0/month infrastructure target

## Explicitly removed

Google Drive, migration infrastructure, Redis, queues, persistent workers, Kubernetes, external primary file storage, and Cloudflare Workers as the filesystem runtime.

## Current phase

Phase 1 foundation:

1. Next.js application shell
2. PostgreSQL connection layer
3. Initial database schema
4. Storage engine boundary and crash-safe primitives
5. Health endpoint
6. Maintenance command placeholder

The production storage mount remains `/srv/noticeboard`. Local development may override `NOTICEBOARD_STORAGE_ROOT`.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Database:

```bash
npm run db:migrate
```

Health:

```text
GET /api/health
```

## Storage model

PostgreSQL owns logical state and metadata. The filesystem owns file bytes. User filenames never become filesystem paths. Uploads are staged, fsynced, atomically renamed, and verified before the database publishes the active state.
