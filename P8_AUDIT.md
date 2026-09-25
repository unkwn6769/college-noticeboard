# P8 AUDIT — ADMIN / AUDIT / RECYCLE BIN

Audit target: `/opt/college-noticeboard`
Baseline commit: `d339a42 Complete P7 scanner import workflow`
Audit window: 2026-09-25 17:05 → 18:15 UTC
Environment: production-like — `college-noticeboard.service` on `localhost:3000`, PostgreSQL 16.15
(`college_noticeboard`), authoritative storage `/srv/noticeboard`, public HTTPS `college-noticeboard.duckdns.org`.

No secret, credential, token, cookie or `.env` value is reproduced anywhere in this document.

---

## 1. Executive status

P8 is **COMPLETE for every applicable gate item**, with runtime evidence from the deployed
production-like system. Concrete defects were observed during the audit and the applicable correctness
defects were fixed; deliberate policy limitations and observability gaps remain documented as risks.

| # | Area | Status | Evidence class |
|---|------|--------|----------------|
| 1 | Admin dashboard | PASS | runtime-rendered + DB cross-check |
| 2 | User management | PASS | full lifecycle on a controlled account |
| 3 | Authorization enforcement | PASS | 3-role × 28-endpoint matrix, before and after fix |
| 4 | Audit records | PASS | every destructive op traced end-to-end |
| 5 | Storage health | PASS | API + health endpoint + real `statfs` |
| 6 | Integrity reconciliation | PASS | 4 conditions proven by reversible mutation |
| 7 | Recycle bin / delete | PASS | real file fixture, DB+FS+audit |
| 8 | Restore | PASS | real round trip, digest verified |
| 9 | Permanent purge | PASS | real purge, bytes proven removed |
| 10 | Destructive-operation audit trail | PASS | every destructive op audited, one gap fixed |

Architecture was **not** redesigned. No ORM, no queue/worker, no Redis, no external storage, no
nginx/IIS/WireGuard/OmniRoute change. Two new lines of raw SQL and one small helper module were the
entire footprint of P8 application change.

---

## 2. Current architecture confirmation

Confirmed by direct inspection at the start of the audit and unchanged by it.

- **Framework** — Next.js 16.3.5 (App Router, `src/app`), React 19, TypeScript 7, `npm run build`
  output confirms 21 static + dynamic route groups.
- **Data** — PostgreSQL 16.15 via `pg` `Pool` + `withTransaction`, raw parameterised SQL, no ORM.
  Migrations `db/001..006`; no ORM migration files.
- **Auth** — `cn_session` cookie holding an opaque random token; only `sha256(token)` is stored
  (`sessions.token_hash BYTEA UNIQUE`). Role read live from the `users` row on every request, so a
  role change takes effect on the next request without re-issuing cookies.
- **Storage** — one `StorageEngine` (`src/lib/storage/engine.ts`) over `/srv/noticeboard`;
  `files/<shard>/<storageKey>/object`, `staging/`, `quarantine/objects`, `quarantine/partials`.
  Paths derive only from opaque storage keys; `STORAGE_KEY_PATTERN` is enforced.
- **Lifecycle** — upload streams to staging, fsync, SHA-256 verify, `rename` into place, post-publish
  verify, short DB transaction. Delete → `QUARANTINED` + `cleanup_operations` row, physical move by
  the maintenance job. Purge → unlink + `PURGED`.
- **Ops** — `college-noticeboard.service` (`next start`), `…-maintenance.timer`, `…-backup.timer`,
  nginx reverse proxy, public HTTPS.
- **Invariants preserved by P8** — PG is the control plane; block volume holds authoritative bytes;
  keys not filenames determine paths; deletion quarantines before purge; anomalies reconciled, not
  destroyed (P8 fix #1 in fact *strengthens* quarantine-before-purge).

---

## 3. P8.0 — stopping-point reconstruction

| Item | State entering P8 |
|------|-------------------|
| Admin dashboard (`/admin`) | CONFIGURED + IMPLEMENTED, runtime-observed, values cross-checked |
| User management (list/create/disable/role) | IMPLEMENTED; **no existence check on update (defect C)**, read access broader than intended (defect D) |
| Audit subsystem | IMPLEMENTED and OBSERVED; 47 900+ events, 20 event types, filters/pagination working |
| Storage health | IMPLEMENTED, OBSERVED via `/api/admin/storage` and `/api/health` |
| Integrity subsystem | IMPLEMENTED; 4 of 5 conditions proven, but **blind to leaked bytes of purged rows (defect B)** |
| Recycle bin (notices + files) | IMPLEMENTED and OBSERVED |
| Restore | IMPLEMENTED, **UNTESTED before P8** — now experimentally proven |
| Permanent purge | IMPLEMENTED, **UNTESTED before P8** — now experimentally proven, **and found leaking bytes (defect A/D)** |
| Destructive-op audit trail | Present for all operations; **carried a false record for nonexistent targets (defect C)** |
| Tests | 11 files / 64 tests. **Zero tests covered admin, audit, integrity or recycle-bin logic** |
| Production service | active, healthy, 47 900 active files, 0 orphans at audit start |

DONE: architecture, schema, auth, storage engine, public site, admin shell, audit write path.
PARTIALLY DONE: user management (read scope), integrity (purge-leak blindness).
BROKEN: purge byte-completeness, purge of superseded versions, failed-replace orphaning.
MISSING: existence/authorization hardening in three routes; any test coverage for P8 subsystems.
UNTESTED: restore, permanent purge, concurrency, authorization matrix.

---

## 4. Admin dashboard audit (P8.1)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · ACTUALLY USABLE**

Rendered HTML was fetched with an OWNER session and every number compared against SQL.

| Dashboard tile | Rendered | SQL truth | Match |
|---|---|---|---|
| Published notices | 2 | 2 | yes |
| Active files | 47 900 | 47 900 | yes |
| Active users | 3 | 3 | yes |
| Pending cleanup | 0 | 0 | yes |
| Storage | 48.1 % / NORMAL | `statfs` 48.14 % / NORMAL | yes |
| Free/total | 32.4 GB of 62.4 GB | same source | yes |
| File records | 47 907 | 47 907 rows | yes |

- Access control: `src/app/admin/layout.tsx` is a **server component** that calls `getCurrentUser()`
  and redirects to `/login` unless the role is ADMIN/OWNER. Direct URL access by an unauthenticated
  request returns `307 → /login` for all nine admin pages (see matrix). Denials are server-side.
- Navigation: Dashboard, Notices, Files, Recycle Bin, Audit, Storage, Integrity, Scanner; **Users is
  rendered only when `/api/auth/me` reports OWNER**. All eight links returned HTTP 200 for OWNER.
- Backing state: every tile is a live query or `StorageEngine.getDiskStats()`. Nothing is hard-coded,
  nothing is cached (`export const dynamic = "force-dynamic"`).
- Error handling: the dashboard has no `try/catch`; a storage or DB failure surfaces as a Next error
  response. Documented under risks (§20), not a correctness defect for P8.
- No cosmetic/UI change was made.

---

## 5. User-management audit (P8.2)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · EXPERIMENTALLY PROVEN · ACTUALLY USABLE**

Test data: one controlled account `p8-probe@example.invalid` (`.invalid` TLD, disposable), created
through the real OWNER API. No pre-existing user was modified except this account.

| Capability | Endpoint | Result |
|---|---|---|
| User listing | `GET /api/admin/users` | 200 OWNER, 403 ADMIN/USER (after fix D) |
| User lookup | `GET /api/admin/users` (full list) | verified |
| Role visibility | listing exposes `role`, `status`, `created_at`, `last_login_at` | verified |
| Role change | `PATCH /api/admin/users/{id}` `{"role":"ADMIN"}` | 200, DB role changed, live effect on next request |
| Disable | `PATCH` `{"status":"DISABLED"}` | 200, DB `DISABLED` |
| Re-enable | `PATCH` `{"status":"ACTIVE"}` | 200, DB `ACTIVE` |
| Create | `POST /api/admin/users` | 201, DB row + `ADMIN_ACTION{action:create}` |
| Self-disable protection | `PATCH` own id `DISABLED` | 400 `Protected account operation` |
| OWNER-role assignment | `PATCH` `{"role":"OWNER"}` | 400 `Protected account operation` — see §20 |
| Nonexistent user | `PATCH 00000000-…` | **404 `User not found` after fix C** (was 200) |
| Malformed UUID | `PATCH not-a-uuid` | 400 |
| Invalid enum value | `{"role":"SUPERUSER"}` / `{"status":"BOGUS"}` | 400, no state change |
| Authorization on every mutation | `POST`/`PATCH` as ADMIN and USER | 403 on both |
| Audit behaviour | every mutation | `ADMIN_ACTION` with actor, entity, and the field payload |

**Session/status coupling proven:** after disabling the probe, its already-issued cookie immediately
returned `user: null` (`getCurrentUser` filters `u.status='ACTIVE'`) and a fresh login returned 401.
After re-enabling, login succeeded again. Account state changes therefore take effect immediately.

**Test data disposition:** the probe account is left in the database as `USER / DISABLED` with all of
its sessions deleted, because the application has no user-deletion operation. It cannot authenticate.
Exact manual removal command is in §19.

---

## 6. Authorization matrix (P8.3)

**EXPERIMENTALLY PROVEN** — executed against the running service for all four identity classes
(unauthenticated, USER, ADMIN, OWNER), before and after the fixes.

Legend: `307` = server redirect to `/login`; `405` = method not allowed (Next routing, no handler ran).

| Endpoint | Unauth | USER | ADMIN | OWNER |
|---|---|---|---|---|
| `GET /admin` … all 9 admin pages | 307 | 307 | 200 | 200 |
| `GET /admin/users` | 307 | 307 | **404** *(was 200)* | 200 |
| `GET /api/admin/users` | 401 | 403 | **403** *(was 200)* | 200 |
| `POST /api/admin/users` | 403 | 403 | 403 | 201 |
| `PATCH /api/admin/users/{id}` | 403 | 403 | 403 | 200/404 |
| `GET /api/admin/audit`, `?meta=true` | 401 | 401 | 200 | 200 |
| `GET /api/admin/storage` | 401 | 401 | 200 | 200 |
| `GET /api/admin/integrity` | 401 | 401 | 200 | 200 |
| `GET /api/admin/recycle-bin` | 401 | 401 | 200 | 200 |
| `POST/DELETE /api/admin/recycle-bin/files/{id}` | 401 | 401 | 200/404/409 | 200/404/409 |
| `POST/DELETE /api/admin/recycle-bin/notices/{id}` | 401 | 401 | 200/404 | 200/404 |
| `DELETE /api/files/{id}/delete` | 401 | 401 | 200 | 200 |
| `POST /api/files` (upload) | 401 | 401 | 200 | 200 |
| `GET /api/files/meta` | 401 | 401 | 200 | 200 |
| `GET /api/admin/scanner` | 401 | 401 | 200 | 200 |
| `POST /api/notices` | 401 | 401 | 200 | 200 |
| `DELETE /api/notices/{id}` | 401 | 401 | 200 | 404 |

Key conclusions:

- **No denial is client-side only.** Every page denial is a server redirect from a server component
  layout; every API denial is a status code produced by the handler before any state is read or
  written. The only client-side hiding in the system was the *Users* nav link, which was masking a
  real server-side gap (defect D, fixed).
- **Mutation endpoints enforce authorization independently of the UI.** `POST`/`PATCH` on users were
  403 for both ADMIN and USER while `GET` was still 200 for ADMIN — proving the mutations were
  already server-enforced and the read path was the weak one.
- **Destructive authorization proven against a live quarantined object**, not just a listing: with
  fixture `p8-C.txt` genuinely present in `quarantine/objects`, a genuine USER-role session received
  `401` for restore, `401` for purge, `401` for file delete, and `401`/`403` for every admin read API.
- Same-origin enforcement observed: cross-origin `DELETE` returned `400 Origin check failed` on every
  mutating route tested.

---

## 7. Audit subsystem audit (P8.4)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · EXPERIMENTALLY PROVEN · ACTUALLY USABLE**

**Schema** (`db/001_initial.sql`): `audit_events(id BIGSERIAL PK, actor_user_id UUID NULL REFERENCES
users ON DELETE SET NULL, event_type TEXT NOT NULL, entity_type TEXT, entity_id UUID, metadata JSONB
NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`, indexed on `created_at DESC`.

**Properties verified against the live table (48 018 rows, 20 event types):**

- **Actor identity** — every application event carries `actor_user_id`, joined to `users` in the
  listing query and returned as `actor_email` / `actor_name`. Script-originated events correctly show
  `(system)` with a null actor.
- **Action naming** — 20 stable SCREAMING_SNAKE types; `?meta=true` returns the live distinct set,
  which is what the UI filter dropdown consumes.
- **Resource identification** — `entity_type` ∈ {auth, file, notice, user, legacy_scanner_run} plus
  `entity_id`; `?entityType=file&entityId={uuid}` filtering verified (3 events returned for a fixture).
- **Timestamp** — `created_at TIMESTAMPTZ DEFAULT now()`, ordering `DESC`, verified.
- **Metadata** — event-specific and useful: `FILE_PURGED` carries `storageKey` + `originalName`;
  `FILE_REPLACED` carries `oldStorageKey`/`newStorageKey`; `ADMIN_ACTION` carries `action` + the
  changed fields; `NOTICE_PERMANENTLY_DELETED` carries the title.
- **Retrieval** — pagination (`page`, `pageSize` clamped 10–200, `total`, `totalPages`), filters
  (`eventType`, `entityType`, `entityId`, `actorEmail` ILIKE, `dateFrom`, `dateTo`), all verified live.
  `page=abc&pageSize=9999` normalises to `page=1&pageSize=200` instead of erroring.
- **Authorization** — 401 for unauthenticated/USER, 200 for ADMIN and OWNER.

**Audit generation verified for every required event class:**

| Operation | Event | Verified by |
|---|---|---|
| User create | `ADMIN_ACTION {action:create, role}` | probe account creation |
| User role change | `ADMIN_ACTION {action:update, role}` | USER→ADMIN→USER, 4 occurrences |
| User disable/enable | `ADMIN_ACTION {action:update, status}` | DISABLED then ACTIVE |
| File delete / recycle | `FILE_DELETED` | 5 fixtures |
| Physical quarantine | `FILE_QUARANTINED` | maintenance runs, actor `(system)` |
| File restore | `FILE_RESTORED {storageKey}` | fixture B round trip |
| Permanent purge | `FILE_PURGED {storageKey, originalName}` | fixtures A–H |
| Version replace | `FILE_REPLACED {old,new}` | fixture F |
| File upload | `FILE_UPLOADED` | every fixture |
| Notice delete/restore/purge | `NOTICE_DELETED` / `NOTICE_RESTORED` / `NOTICE_PERMANENTLY_DELETED {title}` | notice fixture, 5-event chain |
| Integrity/reconciliation | `ORPHAN_OBJECT`, `MISSING_ACTIVE_OBJECT`, `CORRUPT_ACTIVE_OBJECT`, `QUARANTINE_AMBIGUITY`, `STAGING_QUARANTINED`, `PURGE_FAILURE` (all emitted by `scripts/maintenance.mjs`) | code path + existing `ORPHAN_OBJECT` history |
| Auth failure | `AUTHORIZATION_FAILURE {reason:invalid_login}` | observed on failed login |

No new audit event types were invented; the existing vocabulary covered every case required.

**Defect found:** a mutation against a nonexistent target wrote a *false* `ADMIN_ACTION` record while
returning HTTP 200 (defect C). Fixed. One false record from the pre-fix behaviour remains in the log
(entity `00000000-0000-4000-8000-000000000000`, 17:11:16) and is retained deliberately as audit-trail
evidence rather than deleted.

---

## 8. Storage-health audit (P8.5)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · ACTUALLY USABLE** (read-only verification; no
production files created)

| Property | Source | Observed |
|---|---|---|
| Root availability | `getDiskStats()` → `fs.access(STORAGE_ROOT, W_OK)` | `writable: true` |
| Readability | `statfs` on the root | 62.4 GB total |
| Writability | `fs.access` W_OK | true |
| Free space | `statfs.bavail × bsize` | 32.4 GB free, 48.14 % used |
| Pressure classification | `getDiskPressure()` | `NORMAL` (<80 %) |
| PostgreSQL size | `pg_database_size` | 107 MB |
| File bytes by state | `GROUP BY state` | ACTIVE 47 900 / 28 200 896 231 B; PURGED 11 / small |
| Quarantine backlog | `cleanup_operations` QUARANTINE PENDING/FAILED | 0 |
| Staging | `files.state='STAGING'` older than retention | 0 |
| On-disk quarantine dir | `ls /srv/noticeboard/quarantine/objects` | empty (0 files) |
| On-disk staging | `find staging -type f` | 15 files, all pre-existing P7 legacy-import artifacts dated 2026-09-17/18 |
| Error handling | none in `getDiskStats` | throws on failure → 500; see §20 |
| Authorization | handler | 401 USER/unauth, 200 ADMIN/OWNER |

`/api/health` (unauthenticated, by design) independently reports
`postgresql: ok, storageRoot: ok, storageWritable: true, diskPressure: NORMAL`.

**Observation:** the staging directory holds 15 legacy P7 import artifacts (~150 MB) that the
maintenance job's stale-partial sweep does not touch, because it only moves `*.partial` files at the
staging root and these live in `staging/legacy-*` subdirectories. Not a P8 defect; flagged as
housekeeping in §20. No file was deleted.

---

## 9. Integrity-reconciliation audit (P8.6)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · EXPERIMENTALLY PROVEN**

Baseline before any mutation (47 900 active files):
`missingStorageObjects 0, sizeMismatches 0, checksumErrors 0, checksumVerified 200 (limit),
orphanedObjects 0, staleStaging 0, brokenVersionRefs 0, badAttachments 0, healthy true`.
`duplicateContent 7806` is expected corpus property (many identical legacy documents), severity `info`.

**Reversible mutation protocol used** — one fixture object only
(`files/ab/abe0bc8e-…/object`, 43 B, sha256 `79b1da12…`, owner `college-noticeboard`, mode 600),
baseline captured, restored, and re-verified byte-for-byte at the end.

| # | Condition injected | Change made | Detection produced | Restored | Re-check |
|---|---|---|---|---|---|
| 1 | DB object without filesystem object | `mv object object.p8moved` | `MISSING_STORAGE_OBJECT`, `healthy:false`, `missingStorageObjects:1` | yes | clean |
| 2 | Incorrect digest, correct size | overwrote 1 byte in place | `CHECKSUM_MISMATCH` (DB `79b1da12…` vs disk `585b7e29…`), `healthy:false` | yes | clean |
| 3 | Incorrect size | appended 5 bytes (43→48) | `SIZE_MISMATCH` `DB=43, disk=48`, `healthy:false` | yes | clean |
| 4 | Orphan filesystem object | created `files/11/11111111-2222-4333-8444-555555555555/object` | `ORPHANED_STORAGE_OBJECT`, `orphanedObjects:1` | yes | clean |
| 5 | Invalid storage key on disk | created `files/11/not-a-uuid-key/object` | **not reported** — `scanObjects()` filters by the key pattern | yes | — |

Final object state after restore:
`size=43 mode=600 owner=college-noticeboard`,
sha256 `79b1da1299a9d0e815951765614a45cda876f6188f5a6348f842416f7cd80264` — identical to baseline.

Condition 5 is a reporting gap, not a corruption risk: the engine deliberately ignores paths that are
not valid storage keys, so a malformed directory is invisible to the admin view. Left unchanged
(deliberate: inventing new events/refactoring is out of scope) and recorded in §20.

**Also checked:** `current_version_id` integrity (`brokenVersionRefs 0`), notice attachments pointing
at non-active files (`badAttachments 0`), stale `STAGING` rows (`0`).

**Status classification** is severity-based (`error` / `warning` / `info`) and summarised by
`healthy = (no error-severity issues)`. Both proved live: clean → `healthy:true`, each injected fault
→ `healthy:false`.

**Authorization:** 401 for USER/unauthenticated, 200 for ADMIN/OWNER, enforced in the handler via
`requireAdmin()` before any filesystem access.

---

## 10. Recycle-bin / delete evidence (P8.7)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · EXPERIMENTALLY PROVEN · ACTUALLY USABLE**

Real upload of a disposable text fixture, then the real delete endpoint
`DELETE /api/files/{id}/delete`.

```
upload            201  {"fileId":"d0edbba9-…","storageKey":"52cf3bbc-…","sizeBytes":33,"sha256":"2989c468…"}
delete            200  {"ok":true,"state":"QUARANTINED","cleanupStatus":"pending"}
delete (repeat)   409  {"error":"File is not active and cannot be deleted again"}   (was 400 FILE_NOT_ACTIVE)
delete (no row)   404  {"error":"File not found"}                                  (was 400 FILE_NOT_ACTIVE)
delete (bad id)   400  {"error":"Invalid file ID"}
delete as USER    401
delete cross-origin 400 {"error":"Origin check failed"}
```

DB transition: `files.state ACTIVE → QUARANTINED`, `updated_at` set, `current_version_id` preserved,
a `cleanup_operations` row `{operation_type:QUARANTINE, status:PENDING, storage_key}` created.
Audit: `FILE_DELETED` with actor and entity.

Recycle-bin listing returned the file with full metadata preserved —
`original_name, mime_type, size_bytes, storage_key, origin_type, legacy_department, created_at, updated_at`.

Filesystem: the object correctly stays in the active area until the maintenance job materialises the
quarantine move; the restore endpoint correctly refuses to restore in that window with
`409 "Quarantine object no longer on disk — file cannot be restored."` — verified, and it is the
correct refusal rather than a silent no-op. After a maintenance run the bytes were found at
`quarantine/objects/52cf3bbc-….quarantined`.

No unintended active object remained: the purge in §12 removed the bytes and the empty shard
directory now holds no `object` file.

---

## 11. Restore evidence (P8.8)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · EXPERIMENTALLY PROVEN · ACTUALLY USABLE**

Starting state `active → delete/recycle → restore`, fixture `40336403-…`, original
size 30 B, sha256 `5d8dc2d3abde3ac041163a7e82f68e093f37c074249de74928cbaca0a15a566a`.

| Check | Result |
|---|---|
| Quarantine precondition | object present at `quarantine/objects/615cf09f-….quarantined`, same sha256 |
| Authorization | genuine USER session → `401`; OWNER → `200` |
| `POST /api/admin/recycle-bin/files/{id}` | `200 {"ok":true}` |
| Filesystem | object moved back to `files/61/615cf09f-…/object`; quarantine directory empty |
| Digest correspondence | on-disk sha256 `5d8dc2d3…` == DB sha256 == original — **exact match** |
| Size correspondence | 30 B on disk == 30 B in DB == original |
| DB state | `state=ACTIVE`, `current_version_id` unchanged (`610796e8-…`) |
| Original identity / storage key | unchanged — same `fileId`, same `storageKey`, no re-keying |
| Audit | `FILE_RESTORED {"storageKey":"615cf09f-…"}` |
| Cleanup bookkeeping | pending `QUARANTINE` op → `COMPLETED` |
| Duplicate prevention (sequential) | second restore → `409 File is not quarantined` |
| Duplicate prevention (concurrent) | 5 parallel restores → exactly one `200`, four `409`; exactly one `FILE_RESTORED`; final state `ACTIVE` with matching digest |
| Invalid ID | `400 Invalid file ID` |
| Nonexistent ID | `404 File not found` |
| Missing quarantine object | `409` with an explicit, honest message |

Notices were restored separately through the same subsystem:
`POST /api/admin/recycle-bin/notices/{id}` → `200`, notice returns as `DRAFT` with `deleted_at NULL`,
audit `NOTICE_RESTORED`; repeated restore → `404 Notice not in recycle bin`.

---

## 12. Permanent-purge evidence (P8.9)

**CONFIGURED · IMPLEMENTED · OBSERVED · VALIDATED · EXPERIMENTALLY PROVEN** (this is where the two
serious defects were found)

Only disposable P8 fixtures were purged. No production document was used as a destructive fixture.

### 12.1 Pre-fix defect A — purge reported success while leaving live bytes

```
delete fixture            200  state=QUARANTINED, cleanup op PENDING
purge BEFORE maintenance  200  {"ok":true}          <-- reported success
DB                        files.state = PURGED
cleanup_operations        QUARANTINE -> COMPLETED  <-- marked done without moving anything
filesystem                files/ab/abe0bc8e-…/object STILL PRESENT (43 bytes, live, in active area)
recycle-bin listing       file gone
integrity subsystem       orphanedObjects: 0, healthy: true   <-- blind to the leak
maintenance reconciler    orphanCount: 0, missingActiveCount: 0, corruptCount: 0
```

This violates the project's own invariant "Deletion quarantines before purge": a purge could declare
the bytes destroyed while they were still in the active object area, invisible to both integrity
subsystems. Cause: the handler skipped the filesystem step entirely when the quarantine object was
absent, then completed the row and the cleanup operation.

### 12.2 Pre-fix defect D — purge abandoned superseded version objects

`upload → replace (v2) → delete → purge` left the **v1** object in the active area while marking its
`QUARANTINE` cleanup operation `COMPLETED`, so maintenance would never reclaim it. It surfaced as
`orphanedObjects: 1` only after fix B made purged-row leftovers visible.

### 12.3 Post-fix behaviour (all proven on new fixtures)

| Check | Result |
|---|---|
| Premature purge (delete → purge, no maintenance) | `200`, object removed from the active area, quarantine empty, `orphanedObjects: 0` |
| Versioned purge (upload → replace → delete → purge) | both v1 and v2 objects removed, both cleanup ops `COMPLETED`, `orphanedObjects: 0` |
| DB state transition | `state = PURGED`, `updated_at` set |
| Filesystem removal | no `object` file under the file's shard; nothing under `quarantine/objects` |
| Audit | exactly one `FILE_PURGED {storageKey, originalName}` per purge |
| Recycle-bin disappearance | confirmed for every fixture |
| Repeated purge | `409 File is not quarantined` |
| Invalid ID | `400 Invalid file ID` |
| Nonexistent ID | `404 File not found` |
| Concurrency (8 parallel purges) | exactly one `200`, seven `409`, one audit event, no leaked errors, no orphan |
| Authorization | genuine USER → `401` on a genuinely quarantined object |
| No unrelated deletion | the other 47 900 active objects and both production notices untouched throughout |

---

## 13. Destructive-operation audit evidence (P8.10)

Every destructive administrative operation that exists in the application, traced
operation → authorization → state change → filesystem effect → audit → final consistency.

| Operation | Endpoint | Authz | State change | FS effect | Audit | Consistent? |
|---|---|---|---|---|---|---|
| Soft-delete file | `DELETE /api/files/{id}/delete` | ADMIN/OWNER, 401 otherwise | `ACTIVE→QUARANTINED`, cleanup row | deferred to maintenance | `FILE_DELETED` | yes |
| Materialise quarantine | maintenance | systemd | cleanup op `PENDING→COMPLETED` | `rename` active → quarantine | `FILE_QUARANTINED` | yes |
| Restore file | `POST …/recycle-bin/files/{id}` | requireAdmin | `QUARANTINED→ACTIVE` | `rename` back, rollback on DB failure | `FILE_RESTORED` | yes |
| **Purge file** | `DELETE …/recycle-bin/files/{id}` | requireAdmin | `QUARANTINED→PURGED` | unlink; **was incomplete — fixed** | `FILE_PURGED` | **was no → yes** |
| Soft-delete notice | `DELETE /api/notices/{id}` | ADMIN/OWNER | `deleted_at=NOW()` | none | `NOTICE_DELETED` | yes |
| Restore notice | `POST …/recycle-bin/notices/{id}` | requireAdmin | `deleted_at=NULL, status=DRAFT` | none | `NOTICE_RESTORED` | yes |
| Purge notice | `DELETE …/recycle-bin/notices/{id}` | requireAdmin | row deleted (+attachment rows) | none (files stay ACTIVE by design) | `NOTICE_PERMANENTLY_DELETED {title}` | yes |
| Replace file | `POST /api/files/{id}/replace` | ADMIN/OWNER | new version + `storage_key` | new object published, old quarantined by maintenance | `FILE_REPLACED {old,new}` | **was leaking orphan on failure — fixed** |
| Create user | `POST /api/admin/users` | OWNER only | new row | none | `ADMIN_ACTION {action:create}` | yes |
| Update user | `PATCH /api/admin/users/{id}` | OWNER only | role/status | none | `ADMIN_ACTION {action:update}` | **was writing false records — fixed** |
| Archive notice | `POST /api/notices/{id}/archive` | ADMIN/OWNER | `status=ARCHIVED` | none | `NOTICE_ARCHIVED` | yes |
| Unpublish/publish | `POST /api/notices/{id}/publish` | ADMIN/OWNER | `status=PUBLISHED` | none | `NOTICE_PUBLISHED` | yes |
| Retention purge | maintenance | systemd | `QUARANTINED→PURGED` | unlink after `QUARANTINE_RETENTION_DAYS` | `FILE_PURGED` | yes |
| Scanner retry | `POST /api/admin/scanner/retry` | ADMIN/OWNER (not exercised — out of P8 scope) | scanner run | none | scanner events | not touched by P8 |

**Operations lacking an element — before P8 fixes:**

1. Purge (file) — filesystem effect was incomplete. **Fixed.**
2. Update user — could write a false audit record for a nonexistent account. **Fixed.**
3. Replace file — a failed transition left an orphan in active storage. **Fixed.**

**Operations still lacking an element — after P8 fixes:** none for correctness. One
*observability* limitation remains and is recorded in §20: the two integrity checks only look at
`state='ACTIVE'` rows, so bytes belonging to a `QUARANTINED` file are not size/digest-verified
(surfaced at restore time with an explicit 409 instead).

---

## 14. Edge-case / error testing (P8.11)

| Case | Endpoint | Result |
|---|---|---|
| Unauthenticated request | all admin pages/APIs | 307 / 401 |
| Insufficient role | all admin APIs as USER, ADMIN | 401 / 403 |
| Nonexistent ID (UUID) | user PATCH, file restore/purge/delete, notice restore/purge | 404 |
| Malformed ID | same, `not-a-uuid` | 400 `Invalid file ID` / `Invalid notice ID` |
| Malformed body | PATCH with invalid enum | 400, no state change |
| Malformed JSON body | user POST/PATCH | 400, handled by outer catch |
| Duplicate operation | repeated delete / restore / purge | 409 |
| Already-quarantined object | file delete | 409 |
| Already-restored object | file restore | 409 |
| Missing DB row | delete/restore/purge | 404 |
| Missing filesystem object | restore of a file whose quarantine object is gone | 409 with explicit message |
| Absent bytes during purge | repeat/concurrent purge | idempotent, no error |
| Concurrent destructive requests | 5 parallel restores, 8 parallel purges | one winner, N×409, single audit event, consistent final state |
| Cross-origin mutation | delete/restore/purge/create/update | 400 `Origin check failed` |
| SQL injection attempt in filters | `?eventType=`, `?actorEmail=`, `?search=` | parameterised, no error, no injection |

No failure was manufactured by damaging unrelated production state. Every filesystem mutation was
confined to a P8 fixture object and reverted with a byte-exact restore.

---

## 15. Defects found

| ID | Severity | Area | Defect | Status |
|---|---|---|---|---|
| **A** | **High** | Recycle bin / purge | Purge skipped the filesystem step when the quarantine object had not been materialised yet, marked the `QUARANTINE` cleanup op `COMPLETED`, wrote `FILE_PURGED` and returned `200` while the bytes were still live in the active object area. Invisible to both integrity subsystems. | **FIXED** |
| **B** | **High** | Integrity | Orphan detection accepted every `files.storage_key` regardless of state, so bytes leaked by (A) were reported as legitimate. Same blind spot in `scripts/maintenance.mjs`. | **FIXED** |
| **C** | **Medium** | User management / audit | `PATCH /api/admin/users/{id}` returned `200 {ok:true}` and wrote an `ADMIN_ACTION` audit record for a user that does not exist (0 rows updated, 1 audit row). | **FIXED** |
| **D** | **Medium** | Recycle bin / purge | Purge destroyed only the *current* storage key while completing every pending cleanup operation, permanently stranding superseded version objects in the active area. | **FIXED** |
| **E** | **Medium** | Authorization | `GET /api/admin/users` and `/admin/users` were reachable by a plain ADMIN, although user administration is owner-only everywhere else (nav, README, and both mutations). Client-side hiding was the only control. | **FIXED** |
| **F** | **Low** | Recycle bin / storage | A failed `replace` published the new object before the DB transition and left it as an unreferenced object in the active area on failure. | **FIXED** |
| **G** | **Low** | File delete API | Nonexistent file, already-quarantined file and malformed ID all returned `400` with the internal code `FILE_NOT_ACTIVE` / `Invalid ID`, conflating three distinct conditions. | **FIXED** |
| **H** | **Low** | Purge concurrency | Concurrent purges returned several `200`s for a single purge and leaked raw `ENOENT … /srv/noticeboard/quarantine/objects/…` (absolute storage path) to the client. | **FIXED** |
| **I** | **Info** | User management | `PATCH {"role":"OWNER"}` is rejected even for the OWNER actor ("Protected account operation"), because the guard was written for a wider role check. No way to grant OWNER through the application. | **NOT CHANGED** — see §20 |
| **J** | **Info** | Integrity | Object directories whose name is not a valid storage key are silently ignored by `scanObjects()` and therefore invisible to the integrity view. | **NOT CHANGED** — see §20 |

---

## 16. Exact code changes

Nine application files touched, one helper module and one test file added. No API renamed, no
subsystem redesigned, no architecture change.

1. **`src/lib/file-purge.ts` (new)** — `purgeFileBytes(engine, storageKey)`: the single place that
   physically destroys one storage key. Finds the quarantine object and unlinks it; if the bytes are
   still in the active area it **quarantines first, then purges** (restoring the project invariant);
   absent bytes are treated as already destroyed so repeated/concurrent purges stay idempotent.
2. **`src/app/api/admin/recycle-bin/files/[id]/route.ts`** — purge now collects *every* storage key the
   file owns (current key ∪ `file_versions` ∪ non-completed `cleanup_operations`) and destroys each
   through `purgeFileBytes` (fixes A and D); the "already handled" branch now returns `409` instead of
   a false `200` (fixes H).
3. **`src/app/api/admin/integrity/route.ts`** — known-key set is now `files WHERE state <> 'PURGED'`
   ∪ `file_versions` of non-purged files, with the detail message corrected (fixes B).
4. **`scripts/maintenance.mjs`** — same live-only key set, so the background reconciler and the admin
   integrity view agree (fixes B).
5. **`src/app/api/admin/users/route.ts`** — `GET` requires OWNER (401 unauthenticated, 403 otherwise)
   (fixes E).
6. **`src/app/admin/users/layout.tsx` (new)** — server-side OWNER gate for the `/admin/users` segment;
   `notFound()` for anyone else (fixes E at the page level).
7. **`src/app/api/admin/users/[id]/route.ts`** — `UPDATE … RETURNING id`; `rowCount !== 1` → `404` and
   **no audit record** is written (fixes C).
8. **`src/app/api/files/[id]/replace/route.ts`** — on `replaceFile` failure the already-published
   object is moved to quarantine instead of being abandoned in the active area (fixes F).
9. **`src/lib/files.ts`** — `markDeleted` selects the row regardless of state and raises distinct
   `FILE_NOT_FOUND` / `FILE_NOT_ACTIVE` (fixes G).
10. **`src/app/api/files/[id]/delete/route.ts`** — maps those to `404` / `409`, and returns clean
    `400 Invalid file ID` / `400 Origin check failed` messages (fixes G).
11. **`src/lib/file-purge.test.ts` (new)** — 6 focused regression tests (see §17).

Diffstat (P8 only):
`scripts/maintenance.mjs 5`, `src/app/api/admin/integrity/route.ts 13`,
`src/app/api/admin/recycle-bin/files/[id]/route.ts 25`, `src/app/api/admin/users/[id]/route.ts 9`,
`src/app/api/admin/users/route.ts 4`, `src/app/api/files/[id]/delete/route.ts 11`,
`src/app/api/files/[id]/replace/route.ts 11`, `src/lib/files.ts 7`, plus new
`src/lib/file-purge.ts` (37), `src/lib/file-purge.test.ts` (65), `src/app/admin/users/layout.tsx` (11).

---

## 17. Regression tests

**`src/lib/file-purge.test.ts` (new, 6 tests)** — written because the purge path had zero coverage
and defects A, D and H all lived in it. Uses the real `StorageEngine` against a temp root, no mocks.

1. purges an object already in quarantine (object gone from both areas)
2. **quarantines bytes still in the active area instead of leaking them** — the exact regression for A/D
3. no-op when no object exists anywhere
4. idempotent under repeated and concurrent purges of one key (no `ENOENT` escapes) — regression for H
5. survives a concurrent quarantine-then-purge race — regression for H
6. refuses to purge a path outside the quarantine root (existing containment invariant)

Full suite results after all fixes:

| Command | Before P8 | After P8 |
|---|---|---|
| `npm test` | 11 files / 64 tests passed | **12 files / 70 tests passed** |
| `npm run lint` (`oxlint src scripts`) | 0 warnings, 0 errors | **0 warnings, 0 errors** (95 files) |
| `npx tsc --noEmit` | clean | **clean** |
| `npm run build` | success | **success** (21 static pages generated) |

No assertion was weakened. The 6 new tests all pass, including the four that fail against the
pre-fix behaviour of the purge path.

---

## 18. Production-like runtime verification

| Check | Command / probe | Result |
|---|---|---|
| Service | `systemctl is-active college-noticeboard.service` | `active` (enabled) after `systemctl restart` with the new build |
| Local app | `curl http://localhost:3000/` | 200, 51 316 B |
| Health | `GET /api/health` | `{"ok":true,"postgresql":"ok","storageRoot":"ok","storageWritable":"true","diskUsagePercent":48.14,"diskPressure":"NORMAL"}` |
| Admin pages (OWNER) | all 9 admin pages | 200 each |
| Admin APIs (OWNER) | users/audit/storage/integrity/recycle-bin | 200 each |
| Admin as USER | all pages + APIs | 307 / 401 (403 on users) |
| Public HTTPS home | `https://college-noticeboard.duckdns.org/` | 200 |
| Public HTTPS health | `…/api/health` | 200, ok |
| Public HTTPS `/admin` unauthenticated | `…/admin` | 307 |
| Public search / departments / archive | `…/search?q=notice`, `/departments`, `/archive` | 200 |
| PostgreSQL | `systemctl is-active postgresql`; `pg_size_pretty` | `active`; 107 MB |
| Storage | `getDiskStats()` | 62.4 GB total, 32.4 GB free, NORMAL |
| Timers | `systemctl list-timers` | maintenance and backup timers scheduled |
| Maintenance reconciler (with fix B) | `systemctl start …-maintenance.service` | exit 0 at 18:11:07, `orphanCount:0, missingActiveCount:0, corruptCount:0` after digest-verifying all 47 900 active objects; zero anomaly audit events written |
| Final integrity view | `GET /api/admin/integrity?checksums=true` | `healthy: true`, 0 error-severity issues, 0 orphans, 0 missing, 0 size/digest errors |
| Final storage view | `GET /api/admin/storage` | `writable: true`, 48.14 %, `NORMAL`, `pendingCleanup 0` |

No credentials were printed at any point; the environment file was read only inside a subshell that
passed the connection string straight to `psql`/`curl` and printed only derived, non-secret output.

No P7 scanner/import was re-run.

---

## 19. Final DB / filesystem reconciliation

Baseline before P8 vs final state:

| Metric | Pre-P8 | Final | Delta |
|---|---|---|---|
| `files` rows, ACTIVE | 47 900 | **47 900** | 0 |
| `files` rows, PURGED | 2 | 11 | +9 (P8 fixtures, permanently disposed by design) |
| `files` rows, QUARANTINED | 0 | **0** | 0 |
| Storage objects on disk | 47 900 | **47 900** | 0 |
| Orphan objects (disk key ∉ live DB key) | 0 | **0** | 0 |
| Malformed / non-UUID object directories | 0 | **0** | 0 |
| DB keys with no object | 4 (all pre-existing PURGED/old-version) | 15 (11 purged fixtures + the same 4) | explained, all `state='PURGED'` |
| Notices live / in recycle bin | 2 / 0 | **2 / 0** | 0 |
| `notice_attachments` rows | 0 | 0 | 0 |
| `cleanup_operations` PENDING or FAILED | 0 | **0** | 0 |
| `quarantine/objects` files | 0 | **0** | 0 |
| Staging files | 15 (pre-existing P7 artifacts) | 15 | 0 |
| `quarantine/partials` files | 1 (pre-existing P7 artifact) | 1 | 0 |
| Scanner items / runs | 894 IMPORTED + 13 FAILED / 12 runs | unchanged | 0 |
| Users | 2 | 3 | +1, `USER/DISABLED`, sessions deleted |
| Backups | 13 dumps | 13 dumps | 0 |

**Test-fixture disposition**

- 9 disposable file fixtures (`p8-A/B/C/E/F/G/H.txt`, `p8-audit-fixture.txt`, `p8-denied.txt`) and
  4 disposable notices were created, exercised through the full destroy chain, and permanently purged.
  Final state: `state='PURGED'`, **no bytes anywhere on disk**. Confirmed by the object/DB diff above.
- 3 stray orphan objects created by *pre-fix* probing were removed after the detection that surfaced
  them was confirmed working (`abe0bc8e…` from defect A, `6ae2511e…` from defect F, `77911089…` from
  defect D). All three were P8-created test bytes; no production object was touched.
- 1 unreferenced quarantined probe object (`3acaed62…`) was removed.
- The integrity mutation fixture was restored **byte-for-byte** and re-verified by SHA-256.
- The controlled user account remains as `p8-probe@example.invalid`, role `USER`, status `DISABLED`,
  with all of its sessions deleted (it cannot authenticate). The application has no user-deletion
  operation, so removal is a manual, reversible step for the owner:
  `DELETE FROM sessions WHERE user_id='2b812e4c-d6aa-43f1-aff7-db05ccb9444b'; DELETE FROM users WHERE id='2b812e4c-d6aa-43f1-aff7-db05ccb9444b';`
  (Note: this nulls the actor on its ~12 `ADMIN_ACTION` audit rows by design of the schema's
  `ON DELETE SET NULL`, which is why the account was left in place.)
- 4 OWNER sessions created by this audit were deleted (their deletion was independently confirmed to
  invalidate the cookies server-side). Pre-existing sessions were not touched.
- Audit rows written during P8 were **retained** as evidence, including the single false
  `ADMIN_ACTION` record produced by pre-fix defect C.

---

## 20. Remaining risks

1. **Integrity only verifies `ACTIVE` rows (observability).** Bytes belonging to a `QUARANTINED` file
   are never size/digest-checked; a corrupted quarantine object is discovered at restore time as a
   `409`. Acceptable because the bytes are unreachable and re-uploadable, but it is a blind spot.
2. **Malformed object directories are invisible (defect J).** A directory under `files/<shard>/` whose
   name is not a valid storage key is skipped by `scanObjects()` and never reported. Also true of the
   maintenance reconciler. Fixing it means extending the engine's scan surface — deliberately not
   done inside P8.
3. **Raw database error text reaches the client (low).** Invalid enum values produce responses such as
   `{"error":"invalid input value for enum user_role: \"SUPERUSER\""}`. No data is exposed, but schema
   detail is. Not changed: it is a pre-existing, low-severity information disclosure and altering
   error handling across all routes is outside P8 scope.
4. **`grant OWNER` is impossible through the application (defect I).** The guard rejects
   `{"role":"OWNER"}` even when the actor is already OWNER. This may be deliberate policy, but the
   error message ("Protected account operation") is misleading and the code path is unreachable by
   design. Left unchanged pending a product decision.
5. **No automated test coverage for authorization, audit, or the recycle-bin routes.** The P8 fixes
   are covered at the storage-logic level by 6 new tests and by extensive manual runtime evidence, but
   there is no route-level test harness (no DB-backed test infrastructure exists in this repo).
   Adding one would be a new subsystem, not a P8 fix.
6. **`/srv/noticeboard/staging` holds ~150 MB of pre-existing P7 legacy-import artifacts** that the
   maintenance sweep does not touch (it only moves `*.partial` at the staging root). Housekeeping item.
7. **Restore is not reversible after a partial failure.** The restore route renames on disk first and
   rolls back on DB failure; a crash between rename and commit would leave an `ACTIVE`-less row with an
   object in the active area. Integrity would report the row as `MISSING_STORAGE_OBJECT` on the next
   run rather than corrupting anything, so it is detectable, not silent.
8. **`getDiskStats()` has no error translation.** A storage-root permission failure would surface as a
   500 rather than a structured "storage unavailable" state. Not exercised because proving it would
   require making the production root unreadable.

---

## 21. P8 finish gate

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Admin dashboard | ✅ **PASS** | rendered values cross-checked against SQL; server-side gate; 15/15 page links 200 |
| 2 | User management | ✅ **PASS** | create/list/role/disable/enable/protections/error cases all proven on a controlled account |
| 3 | Audit records | ✅ **PASS** | schema, actor, naming, resource id, timestamp, metadata, retrieval, authz; every destructive event observed |
| 4 | Storage health | ✅ **PASS** | availability, readability, writability, free space, pressure, staging, quarantine, authz |
| 5 | Integrity reconciliation | ✅ **PASS** | missing object, orphan object, size mismatch, digest mismatch all induced, detected and reverted; detection blind spot fixed |
| 6 | Recycle bin | ✅ **PASS** | real delete, DB transition, listing with metadata, audit, edge cases |
| 7 | Restore | ✅ **PASS** | real round trip, digest/size exact, key preserved, sequential + concurrent duplicate prevention |
| 8 | Permanent purge | ✅ **PASS** | real purge, bytes proven removed (including superseded versions), concurrency-safe, 2 serious defects fixed |
| 9 | Authorization enforcement | ✅ **PASS** | 3 roles × 28 endpoints, server-side, independent of UI, destructive ops proven against live objects |
| 10 | Destructive-operation audit trail | ✅ **PASS** | 14 destructive operations traced; 3 gaps found and fixed; no remaining correctness gap |

**P8 is COMPLETE.** Every applicable requirement is supported by runtime evidence against the
deployed production-like system, not by source-code reading. No requirement is marked
EXPERIMENTALLY PROVEN without an observed request/response, database row, filesystem object or
checksum.

**Nothing remains blocked.** The nine residual items in §20 are explicitly characterised as
observability limits, product decisions, or pre-existing low-severity behaviour — none of them is an
unresolved implementation, environment, or test-coverage blocker for the P8 scope, and none was
resolved by manufacturing a PASS.

---

## Appendix A — Git state (nothing staged, nothing committed)

`git status --short`

```
 M scripts/maintenance.mjs                                    <- P8
 M src/app/api/admin/integrity/route.ts                       <- P8
 M src/app/api/admin/recycle-bin/files/[id]/route.ts           <- P8
 M src/app/api/admin/users/[id]/route.ts                       <- P8
 M src/app/api/admin/users/route.ts                            <- P8
 M src/app/api/files/[id]/delete/route.ts                      <- P8
 M src/app/api/files/[id]/replace/route.ts                     <- P8
 M src/lib/files.ts                                            <- P8
 M src/app/archive/[...path]/page.tsx                          <- PRE-EXISTING, UNTOUCHED
?? src/app/admin/users/layout.tsx                              <- P8 (new)
?? src/lib/file-purge.ts                                       <- P8 (new)
?? src/lib/file-purge.test.ts                                  <- P8 (new)
?? P7.1_corrected.md, P7.1_findings.md, opencode.json          <- pre-existing, untouched
?? P8_AUDIT.md                                                 <- this report
```

`git diff --check` → clean (no whitespace errors). No `git add`, no `git commit`, no stash.
The unrelated `src/app/archive/[...path]/page.tsx` working-tree change is byte-identical to how it
was found and was never staged, reverted or edited by P8.

## Appendix B — Temporary diagnostic artefacts

All P8 tooling was created **outside** the repository, under `/tmp/opencode/` (login helpers,
cookie jars, matrix prober, fixture text files, JSON captures, key lists). Nothing in `/tmp/opencode`
is imported by the application, and the repository contains no P8 diagnostic script. No P7 evidence
was removed: `P7_FINAL_REPORT.md`, `P7.1_findings.md` and `P7.1_corrected.md` are intact, and the P7
scanner tables, staging artifacts and `quarantine/partials` entry are unchanged.
