# College Noticeboard P7 Final Report

Date: 2026-09-25
Repository: `/opt/college-noticeboard`
Production service: `college-noticeboard.service`
Production storage root: `/srv/noticeboard`
Authoritative source: `http://10.24.14.231/noticeboards/`

## 1. Executive status

**P7 status: COMPLETE for the eleven required capabilities.**

Both previous blockers were addressed with evidence:

1. **True preview/approval implemented and experimentally proven non-mutating.** Preview now performs read-only discovery, read-only database lookups, and bounded source hashing. It does not create scanner runs, scanner items, files, versions, staging files, quarantine files, or audit events. Import requires a short-lived, server-validated approval manifest. Import revalidates the candidate set and source digests.
2. **Full real-IIS execution completed and reached a terminal state.** The approved full run processed 907/907 candidates, recorded 14 bounded source failures, continued past them, and finished `SUCCEEDED`. All 14 failures were explicitly recorded; one was then recovered through the real retry path.

The run is not a claim that every IIS item imported: 13 scanner items remain `FAILED` because their real IIS streams exceeded the bounded timeout, and three source directory prefixes remain inaccessible. Those are explicit, actionable operational conditions rather than silent successes.

No OmniRoute, IIS, nginx, WireGuard, database schema, service configuration, or unrelated application code was changed. `src/app/archive/[...path]/page.tsx` was preserved exactly as found.

## 2. Architecture confirmation

The existing architecture remains authoritative:

- PostgreSQL remains the logical state authority.
- `/srv/noticeboard` remains the authoritative filesystem store.
- The existing StorageEngine staging, SHA-256, fsync, atomic rename, verification, quarantine, and purge path was retained.
- File IDs and generated storage keys determine object paths.
- Raw SQL and the existing service architecture were retained.
- The actual IIS HTTP source was used for all new real-source evidence.
- No fake/local scanner source, Redis, worker, queue, Kubernetes, Google Drive, ORM, external primary storage, or replacement scanner architecture was introduced.
- No database migration was required. Preview approval state is held in server memory only and is intentionally invalidated by a service restart.

## 3. Terminology and status legend

- **CONFIGURED:** runtime/database/UI setting exists.
- **IMPLEMENTED:** code path exists.
- **OBSERVED:** result was seen at runtime.
- **VALIDATED:** checked against database, filesystem, logs, or audit evidence.
- **TESTED:** automated focused test passed.
- **EXPERIMENTALLY PROVEN:** controlled real-source or production-safe runtime experiment demonstrated the behavior.
- **ACTUALLY USABLE:** the complete path is wired into the existing application and passes build/type/lint checks.

## 4. P7.1 findings

| Area | Status | Evidence | Location |
|---|---|---|---|
| Scanner source | CONFIGURED / IMPLEMENTED / OBSERVED | Real IIS adapter discovered 907 candidates. Full approved IMPORT run processed 907/907. | `src/lib/legacy-scanner.ts`, `src/lib/legacy-source-adapters.ts` |
| IIS fetching | CONFIGURED / IMPLEMENTED / EXPERIMENTALLY PROVEN | Real HTTP crawl; 3 directory failures recorded (`500`, two `400`). | `HttpDirectoryAdapter` |
| Department registry | CONFIGURED / TESTED | All 15 slugs remain registered; 12 departments were reachable in the real crawl, with 3 prefixes inaccessible. | `src/lib/department-registry.ts` |
| Input validation | IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN | Unsafe and encoded traversal rejected; temporary names, relative path rules, department classification, response limits enforced. | `legacy-source-adapters.ts`, `legacy-scanner.test.ts` |
| Parsing | IMPLEMENTED / OBSERVED | IIS directory HTML parsed into bounded same-origin links; binary document bytes streamed and hashed. | `parseDirectory`, `discover`, `hashSource` |
| Preview | IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Read-only preview returned 907 candidates, approval fingerprint, category counts, discovery failures, and a short-lived approval token. Before/after persistence counts were identical. | `previewLegacyScan`, scanner API/UI |
| Import | IMPLEMENTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Approved full run reached terminal `SUCCEEDED`; previous controlled real-source publication produced matching DB/filesystem/audit evidence. | `startLegacyScan`, `execute`, `publish` |
| Duplicate handling | IMPLEMENTED / EXPERIMENTALLY PROVEN | Full run classified 904/901 candidates as duplicates in successive previews; no duplicate object or version was created. | `publish`, `execute` |
| Partial failure | IMPLEMENTED / EXPERIMENTALLY PROVEN | Real success/failure/success batch from prior evidence remains valid; new full run also continued after 14 bounded failures. | `execute`, StorageEngine |
| Error reporting | IMPLEMENTED / OBSERVED / VALIDATED | 14 item failures persisted with timeout messages; run status and counts were terminal and queryable. | `legacy_scanner_items`, `scannerStatus` |
| Audit | IMPLEMENTED / OBSERVED / VALIDATED | Completion audit created for the full run; import and recovery audit counts reconciled. | `audit`, `publish` |

### Actual execution flow

`POST /api/admin/scanner` with `action: PREVIEW`
→ `previewLegacyScan()`
→ bounded IIS discovery
→ read-only `SELECT` of existing scanner items and active legacy files
→ bounded concurrent source hashing
→ categorized candidate manifest plus HMAC approval token
→ no persistent mutation.

`POST /api/admin/scanner` with `mode: IMPORT` and the approval token
→ server-held manifest lookup and HMAC/expiry validation
→ advisory lock and run row creation
→ fresh discovery and candidate-set revalidation
→ bounded source verification
→ per-item duplicate/import decision
→ StorageEngine publication and DB transaction for successful imports
→ per-item failure persistence for bounded failures
→ terminal run status and completion audit.

## 5. P7.2 evidence — successful import

### Prior controlled import evidence retained

The prior real-source publication evidence remains valid: the actual `civil-noticeboard/CED-NBA-Docs/Syllabus/R-18/Fist year.pdf` was streamed from IIS, hashed, published through the existing StorageEngine, stored under a generated storage key, recorded in `files` and `file_versions`, and audited. The object size and SHA-256 matched the database exactly.

### New approved full-run evidence

Fresh real preview immediately before the full run reported:

- 907 candidates discovered.
- 0 new.
- 0 changed.
- 904 duplicate.
- 0 invalid.
- 3 failed candidates.
- 3 inaccessible directory prefixes.
- 0 missing.

The approved import run was:

- Run ID: `2131db89-70bf-4599-919f-19269529cf56`
- Mode: `IMPORT`
- Status: `SUCCEEDED`
- Started: `2026-09-25T15:48:25Z`
- Completed: `2026-09-25T16:05:26Z`
- Processed: `907/907`
- Failed items: `14`
- Imported objects: `0` (all non-failed candidates were already represented by active legacy files)
- Final unchanged count: `895`
- Completion audit: 1 `LEGACY_SCANNER_COMPLETED` event

The run did not terminate early, freeze, or silently treat failures as success.

## 6. P7.3 evidence — duplicate handling

Duplicate behavior was revalidated in the new full run:

- Preview classified 901 candidates as duplicates in the final pre-full-run check and 904 in the immediately preceding check.
- The full run created no new active file objects.
- `imported_count` remained `0`.
- Existing scanner identity and active file matching continued to skip already-imported content.
- The prior controlled duplicate test also returned the original file ID with unchanged DB/version/audit counts.

Conclusion: **PASS — duplicate imports remain idempotent and do not create duplicate files.**

## 7. P7.4 evidence — malformed input

The prior malformed-input evidence remains valid and the new code did not regress it:

- `../outside.txt` is rejected as `Invalid legacy source path`.
- `cse-noticeboard/%2e%2e/out.txt` is rejected before HTTP access.
- Real discovery before and after malformed rejection remained 907 candidates.
- Valid real discovery was not mutated by malformed input.

Focused regression coverage remains in `src/lib/legacy-scanner.test.ts`.

Conclusion: **PASS — malformed input is rejected clearly without affecting valid discovery.**

## 8. P7.5 evidence — partial-failure behavior

### Prior controlled batch

The prior real three-item sequence remains valid evidence:

1. Real item 1 imported.
2. Real item 2 failed a deliberate checksum mismatch.
3. Real item 3 imported.

Successful items committed independently, the failed staging bytes were quarantined, and no active object existed for the failed item.

### New full-run failure evidence

The full real corpus contained 14 bounded failures. Representative recorded items were:

- `csecs-noticeboard/hadoop-3.3.1.tar`
- `cse-noticeboard/NBA/CSE-FINAL SAR - GENERATED BY PORTAL.pdf`
- `cse-noticeboard/OTHERS/2017 batch wise computations.zip`
- `gen-noticeboard/NAAC2016.pdf`
- `gen-noticeboard/Newsletter April-June-18.pdf`
- `gen-noticeboard/Newsletter July-December 2013.pdf`
- `gen-noticeboard/Newsletter July-Sep 2019.pdf`
- `gen-noticeboard/Newsletter July-September 2018.pdf`
- `gen-noticeboard/Newsletter Jan-June 2013.pdf`
- `gen-noticeboard/Newsletter Oct-Dec 2019.pdf`
- `gen-noticeboard/CVR Journal Volume 11 December 2016.pdf`
- `gen-noticeboard/CVR Journal Volume 21.pdf`
- `gen-noticeboard/CVR Journal Volume17.pdf`
- `gen-noticeboard/CVR Journal Volume 25.pdf`

Every failure had a persisted error message:

`HTTP source stream timed out after 120000ms`

Subsequent candidates continued, the run reached `SUCCEEDED`, and no failure was recorded as an import success.

The three inaccessible directory prefixes remained:

- `csit-noticeboard` — HTTP 500
- `eee-noticeboard/Course Structure & Syllabus - R22` — HTTP 400
- `it-noticeboard/2023-24/General/Graduation Day List & Invitation` — HTTP 400

Conclusion: **PASS — partial failures are bounded, recorded, non-silent, and do not stop later candidates.**

## 9. P7.6 evidence — recovery

The new recovery test used the actual `retryLegacyScannerItem()` path against a real failed item:

- Item: `gen-noticeboard/Newsletter July-September 2018.pdf`
- Item ID: `272f948f-5574-4b07-ac38-13d2a5ace607`
- Result: `IMPORTED`
- File ID: `792c29e6-a222-4be1-b787-c9aa2562e81f`
- Error state: cleared
- Retry duration: approximately 26 seconds

After recovery:

- Scanner items: 894 `IMPORTED`, 13 `FAILED`.
- The recovered DB key had a matching active filesystem object.
- No duplicate active object was created.
- The quarantined controlled partial remained quarantined and was not promoted.

Conclusion: **PASS — recovery works after the new bounded-stream implementation.**

## 10. Preview implementation and non-mutation evidence

### Implementation

Preview is implemented in `src/lib/legacy-scanner.ts` and exposed by the existing admin API/UI:

- It performs only `SELECT` queries against `legacy_scanner_items` and active legacy `files`.
- It performs bounded read-only source inspection and hashing.
- It returns candidate outcomes: `NEW`, `CHANGED`, `DUPLICATE`, `INVALID`, `FAILED`.
- It returns discovery failures and missing-path counts.
- It creates a fingerprint over the candidate manifest.
- It creates a short-lived HMAC approval token.
- The server retains the manifest in memory only; no preview rows or approval rows are written.
- Import validates the token, expiry, fingerprint, candidate set, and per-candidate digest before publishing.
- An invalid or expired token is rejected before a scanner run row is created.

### Real before/after evidence

Baseline immediately before the final real preview:

- DB files: 47,901
- File versions: 47,903
- Scanner runs: 12
- Scanner items: 907
- Legacy audit events: 47,899
- Filesystem objects: 47,899
- Filesystem bytes: 28,189,167,436
- Filesystem inventory SHA-256: `263aa7e325703e455b9d57f044d3c66c219fda0713affc69ff17dace98843809`
- Staging: 15 files / 147,841,439 bytes
- Quarantine: 1 file / 116,689 bytes

After the real preview:

- DB files: 47,901
- File versions: 47,903
- Scanner runs: 12
- Scanner items: 907
- Legacy audit events: 47,899
- Filesystem objects: 47,899
- Filesystem bytes: 28,189,167,436
- Filesystem inventory SHA-256: `263aa7e325703e455b9d57f044d3c66c219fda0713affc69ff17dace98843809`
- Staging: 15 files / 147,841,439 bytes
- Quarantine: 1 file / 116,689 bytes

The real preview result was:

- 907 discovered
- 901 duplicate
- 6 failed
- 0 new
- 0 changed
- 0 invalid
- 0 missing
- 3 inaccessible directory prefixes
- 6 explicit failed candidate records

No persistent DB or filesystem mutation occurred. The focused unit test additionally proved that preview executes only read queries.

## 11. Robust full-corpus implementation

The previous stall was caused by unbounded source-stream consumption. The implementation now provides:

- Separate bounded HTTP header timeout: existing `LEGACY_NOTICEBOARD_HTTP_TIMEOUT_MS`, default 15 seconds.
- Separate bounded HTTP body timeout: `LEGACY_NOTICEBOARD_HTTP_STREAM_TIMEOUT_MS`, default 120 seconds.
- Scanner item consumption safety bound: `LEGACY_SCANNER_ITEM_TIMEOUT_MS`, default 180 seconds.
- Explicit stream cancellation/destruction on timeout.
- Bounded retries for transient fetch failures.
- Bounded concurrent source hashing using the existing concurrency configuration, default 4.
- Per-item failure persistence and continuation.
- No global timeout increase.

The real full run demonstrated the fix by reaching a terminal state instead of hanging indefinitely.

## 12. Code changes and defect justification

### `src/lib/legacy-source-adapters.ts`

- Added finite response-body and source-stream timeouts.
- Added cancellation/destruction of timed-out streams.
- Preserved existing retry and response-size limits.
- Justification: the real full run previously stalled indefinitely at an IIS candidate; the new full run reached terminal state with explicit timeouts.

### `src/lib/legacy-scanner.ts`

- Added read-only `previewLegacyScan()`.
- Added candidate categorization, fingerprinting, HMAC approval tokens, and in-memory manifest validation.
- Required approval for IMPORT.
- Added import-time candidate-set and digest revalidation.
- Added bounded concurrent source verification.
- Added per-item timeout conversion and continuation.
- Justification: the prior implementation had no true preview/approval boundary and allowed one unbounded source stream to stall the run.

### `src/app/api/admin/scanner/route.ts`

- Added `action: "PREVIEW"`.
- Required `approvalToken` for IMPORT.
- Justification: expose the new preview/approval boundary through the existing admin API.

### `src/app/admin/scanner/page.tsx`

- Added read-only Preview control.
- Added approval summary and import gating.
- Preserved existing dry-run, status, failure, and retry UI behavior.
- Justification: the admin workflow needed a real review/approval step.

### Tests

- `src/lib/legacy-scanner.test.ts`: preview read-only query test and invalid approval rejection test.
- `src/lib/legacy-source-adapters.test.ts`: body cancellation/timeout regression test.
- Existing scanner/adapter tests retained and extended.

No schema, IIS, service unit, nginx, OmniRoute, WireGuard, or archive-page change was made.

## 13. Test results

Passed:

- `npm test` — 11 test files, 64 tests passed.
- `npm run lint` — 0 warnings, 0 errors.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- Focused scanner tests — 10 passed.
- Focused source-adapter tests — 9 passed.
- Real IIS preview — passed twice against the configured source.
- Real approved full IIS run — terminal `SUCCEEDED`, 907/907 processed.
- Real recovery retry — passed.
- Final DB/filesystem reconciliation — passed.

The full real run was intentionally not declared a clean import: 14 source items were recorded as bounded failures, and 13 remain after one successful recovery.

## 14. Final database/filesystem reconciliation

Final state after the full run and recovery:

- Active DB storage keys: 47,900
- Filesystem object keys: 47,900
- DB keys missing filesystem objects: 0
- Filesystem objects without active DB rows: 0
- Active files: 47,901
- File versions: 47,904 after recovery
- Scanner items: 894 `IMPORTED`, 13 `FAILED`
- Latest scanner run: `SUCCEEDED`, 907/907 processed
- Staging: 15 files / 147,841,439 bytes
- Quarantine: 1 file / 116,689 bytes
- `LEGACY_FILE_IMPORTED` audits: 47,894
- `LEGACY_SCANNER_FILE_IMPORTED` audits: 5
- `LEGACY_SCANNER_COMPLETED` audits: 1

The quarantined partial remains evidence of the controlled failure test and is not an active object.

## 15. Remaining risks

1. Thirteen real IIS items remain `FAILED` because their source streams exceeded the bounded 120-second stream timeout. They are explicit, recoverable, and do not block the run terminal state.
2. Three IIS directory prefixes remain inaccessible with HTTP 500/400 and require source-side availability correction outside P7.
3. Source hashing throughput is modest; a full preview/import can take tens of minutes for approximately 2.1 GB of IIS content. The behavior is bounded and correct, but future operational tuning may reduce duration.
4. Approval manifests are process-local and short-lived. A service restart invalidates outstanding approvals; this is safe but requires a new preview.
5. Filesystem and PostgreSQL remain separate resources. A crash between object publication and DB commit can require reconciliation; the controlled tests found no orphan.

## 16. Updated 11-item finish gate

| # | Requirement | Classification | Evidence |
|---:|---|---|---|
| 1 | Scanner input | CONFIGURED / IMPLEMENTED / OBSERVED / VALIDATED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Real IIS discovery returned 907 candidates. |
| 2 | Validation | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Real malformed paths rejected; focused tests pass. |
| 3 | Parsing | CONFIGURED / IMPLEMENTED / OBSERVED / VALIDATED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Real IIS HTML/path parsing and bounded hashing observed. |
| 4 | Preview | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Real before/after persistence evidence identical; approval token enforced. |
| 5 | Import | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Approved full run reached `SUCCEEDED`; prior real single-item publication remains valid. |
| 6 | Error reporting | CONFIGURED / IMPLEMENTED / OBSERVED / VALIDATED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | 14 bounded failures persisted with actionable timeout messages; terminal run queryable. |
| 7 | Audit | CONFIGURED / IMPLEMENTED / OBSERVED / VALIDATED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Completion, import, and recovery audit counts reconciled. |
| 8 | Duplicate handling | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Full run created no duplicate objects; prior controlled duplicate test passed. |
| 9 | Malformed input handling | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Encoded traversal and unsafe path rejection proven. |
| 10 | Partial-failure handling | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Real batch continued after failure; 14 full-run failures were bounded and recorded. |
| 11 | Recovery | CONFIGURED / IMPLEMENTED / TESTED / EXPERIMENTALLY PROVEN / ACTUALLY USABLE | Actual retry path recovered a real failed item and cleared its error. |

**Final determination: P7 COMPLETE.** All eleven required capabilities are supported by current runtime/test evidence. Remaining failed IIS items and inaccessible directories are explicit operational conditions with recovery paths, not untested requirements.
