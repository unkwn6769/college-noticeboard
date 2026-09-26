# P10 — Defect Remediation Report

**Status:** COMPLETE for every defect in the documented P10 sequence
**Date:** 2026-09-26
**Baseline:** P9 MAX, commit `1e3569641bfa49eb1259483d22a1e7dc24457224`
**Working tree at start:** 10 modified files + this untracked file, all matching the
in-progress P10 notes (classified EXPECTED EXISTING P10 WORK and preserved)

Evidence labels used throughout are the project labels: IMPLEMENTED, TESTED, OBSERVED,
VALIDATED, NOT VERIFIED.

---

## 1. How each defect was decided

Every item was checked against the running application before being changed, because several
items on the list were either already fixed or were not defects at all. A browser was
available for this phase (Playwright driving the cached Chromium build), which P9 could not
use, so every layout and accessibility claim below is measured rather than inferred.

| # | Defect | Verdict | Evidence |
|---|---|---|---|
| 1 | Deep archive layout | **REAL DEFECT** | 21 of the 22 classes on the page were undefined in CSS |
| 2 | Narrow resource-row overflow | **REAL DEFECT, prior fix ineffective** | rows were 1278px wide inside a 320px clipped box |
| 3 | Login 5xx sanitization | **no leakage; status semantics were wrong** | message was always sanitized, but faults reported 400 |
| 4 | Notice action-row overflow | **REAL DEFECT** | 12px document overflow at 320px |
| 5 | Skip-link consistency | **already fixed** | `#main-content` present on all routes |
| 6 | Duplicate `aria-current` | **REAL DEFECT** | 2–3 per page, and two `nav`s claiming one current page |
| 7 | Mobile drawer focus restoration | **REAL DEFECT** | focus landed on `<body>` on both drawers |
| 8 | Admin table / keyboard access | **already fixed** | all 8 `.table-wrap` regions focusable and arrow-scrollable |
| 9 | Scanner partial-failure status | **REAL DEFECT, wider than described** | UI vocabulary did not match the schema at all |
| 10 | Scanner information disclosure | **REAL DEFECT, live** | internal host present in the admin DOM |
| 11 | Command palette focus restoration | **REAL DEFECT** | focus landed on `<body>` |
| 12 | Scanner locked-state accessibility | **REAL DEFECT** | `aria-disabled` absent; state conveyed by dimming only |
| 13 | Breadcrumb semantics | **REAL DEFECT** | two implementations, one using raw `<a href>` |
| 14 | Health endpoint metadata | **NOT A DEFECT** | no host, path, version, or secret; see §4 |

---

## 2. What changed and why

### 2.1 Deep archive layout (#1) and breadcrumb semantics (#13)

**Root cause.** `src/app/archive/[...path]/page.tsx` was the only page left on the retired
`.public-*` vocabulary. A class-coverage sweep over every `className` in `src` against all six
stylesheets found **21 undefined selectors, 20 of them on this one file** (the 21st,
`.public-page`, is also on this file). Nothing styled the page: folder cards, file rows,
breadcrumbs, pagination, the department hero and the quick links all rendered as unstyled
inline content. The page also carried its own inline breadcrumb, a plain `<div>` with an
`aria-label` and no landmark role and no `aria-current` — a third breadcrumb implementation.

**Change.** The page was migrated onto the architecture the department route already uses:
`PageHeader` + `Breadcrumbs` + `ArchiveBrowser` + `EmptyState` + the existing
`quick-access` block. No new CSS was added. The inline breadcrumb was deleted.

**Preserved deliberately:** route and path semantics, both `notFound()` guards, the
department-stats guard, `id="main-content"`, the server-component boundary, `force-dynamic`,
pagination semantics including the archive route's own out-of-range behaviour, both empty-state
messages, and every navigation target (folder links still point at `/archive/...`, file
detail links still point at `/departments/<slug>/file/<id>`, and the three quick-link targets
are still present). The protected-file rules in the phase brief were followed: no routing,
authorization, storage, schema or architectural change.

**VALIDATED.** Folder cards now compute `display:flex`, `border:1px`, `padding:12px`; the
listing computes `display:grid`; exactly one breadcrumb landmark (`aria-label="Breadcrumb"`)
renders as an `<ol>` with one `aria-current="page"`.

### 2.2 Single breadcrumb implementation, and duplicate `aria-current` (#6, #13)

**Root cause.** Three separate implementations existed. `Breadcrumbs.tsx` used raw
`<a href>`, put the flex class on the `<nav>` itself rather than on a list, and appended
"(opens in the same page)" to every link — redundant text a screen reader reads on every
crumb. `ArchiveBrowser.tsx` carried a second `nav > ol`. The department page rendered **both**,
so one page announced the current location three times. Separately, `isPublicNavActive`
declared and documented a `fragmentOnly` flag that was never read, so on `/` both "Home" and
"Notices" carried `aria-current="page"` inside the same `nav`.

**Change.** `Breadcrumbs.tsx` is now the only implementation: a labelled `nav` containing an
`<ol class="breadcrumbs">`, `next/link` for every non-final crumb, and `aria-current="page"` on
the final crumb only. `ArchiveBrowser` delegates to it and its `breadcrumbs` prop is optional.
The department page merges the archive location into its single page trail. The redundant
per-link screen-reader text was removed. `isPublicNavActive` now takes the nav item and honours
`fragmentOnly`.

**VALIDATED.** 20 routes measured: at most one `aria-current="page"` per `nav`, at most one
breadcrumb trail per page, exactly one `h1` per page.

### 2.3 Resource-row overflow (#2) — the previous fix did not work

**Root cause.** `.resource-list` is `display: grid` with no `grid-template-columns`, so its
single `auto` track is sized to **max-content**. `.resource-name` and `.resource-sub` are
`white-space: nowrap`, so a long file name made every row 1278px wide inside a 320px box;
`.resource-list` has `overflow: hidden`, so the row was clipped rather than scrolled and
`.resource-size` was pushed out of sight entirely. The `@media (max-width: 380px) { .resource-size
{ display: none } }` rule added earlier addressed a symptom: it hid an element that was already
invisible, and it did nothing at 768px or 1280px, where the size was equally clipped.

**Change.** One declaration: `grid-template-columns: minmax(0, 1fr)` on `.resource-list`, so
the track can shrink to the column and the ellipsis rules already on the name and sub lines do
their job. The 380px media query was **removed**, because no information needs hiding any more.

**VALIDATED.** At 320px the list's `scrollWidth` and `clientWidth` are both 286px (previously
1278 vs 286) and the row is 286px (previously 1278px). `.resource-size` is visible at every
viewport from 320px up, at all four tested widths. No information is hidden at any width.

### 2.4 Notice action-row overflow (#4)

**Root cause.** `.reading-actions` has no CSS rule at all — it is referenced only by
`print.css`, which hides it. The element carried `row row-2` and a `spacer`, so it was a
non-wrapping flex row: 106 + 112 + 73px of controls plus gaps exceeded a 320px viewport and
pushed the "Print" button to x=332, giving the document a 12px horizontal scrollbar.

**Change.** Reused the existing `.toolbar` / `.toolbar-group` pair, which already exist for
exactly this shape (left group, right group, wraps when it must). No new CSS. The `spacer` is
no longer needed because `.toolbar` uses `justify-content: space-between`. `.reading-actions`
is kept on the element because `print.css` keys on it.

**VALIDATED.** `flex-wrap: wrap`; every child is inside the viewport at 320, 360 and 768px;
document overflow 12px → 0px.

### 2.5 Scanner status semantics (#9) — the defect was larger than described

**Root cause.** `db/006_legacy_scanner.sql` constrains `legacy_scanner_runs.status` to
`RUNNING | SUCCEEDED | FAILED | INTERRUPTED`. The UI vocabulary mapped `PENDING`, `RUNNING`,
`COMPLETED`, `FAILED`, `CANCELLED`. **`SUCCEEDED` and `INTERRUPTED` were unmapped and
`COMPLETED` never occurs.** Consequences, all observed live:

- A finished run rendered as an unmapped neutral "Succeeded" badge, losing the success tone.
- `stageIndex` tested `status === "COMPLETED"`, so the workflow indicator never advanced past
  "Import" — it was stuck showing step 3 for a run that had finished.
- `progress-bar-fill-success` was likewise unreachable.
- A `SUCCEEDED` run carrying a source-discovery summary was rendered in a **red
  `status-banner-danger` reading "The run reported an error"** — a successful import presented
  as a failure.
- Partial failure (`failed_count > 0`) had no representation at all.

**Change.** `SCANNER_RUN` in `src/lib/status.ts` now mirrors the schema constraint, and a new
`scannerRunOutcome(run)` reports a run that finished with failed items as a warning whose label
carries the count. The scanner page uses the real statuses for the workflow step, the progress
bar, and a three-way banner: failed → danger, interrupted → warning, succeeded-with-a-summary
→ warning, succeeded-clean → no banner.

**VALIDATED.** Against the live run (`2131db89…`, IMPORT, SUCCEEDED, 907/907 processed,
`failed_count` 14) the page now shows `badge-warning` reading **"Succeeded with 14 failed
items"**, the workflow marks **Result** as `aria-current="step"`, and the progress bar carries
`progress-bar-fill-success`. A test derives the permitted status set from the schema file
itself, so adding a status in a future migration fails the test instead of degrading silently.

### 2.6 Scanner information disclosure (#10) — live internal host in the admin UI

**Root cause.** `HttpDirectoryAdapter` records each unreadable source directory as
`{ url, relativePathPrefix, status, error }`, and `execute()` built the run's `error_message`
from `failure.url` — the absolute internal URL, host included. That message is returned by
`GET /api/admin/scanner` and rendered verbatim. `previewLegacyScan` had already been written
correctly, mapping failures to `relativePathPrefix` only, so the two paths disagreed.

The production database contained exactly this. A read-only query returned a `SUCCEEDED` run
whose `error_message` began
`http://10.24.14.231/noticeboards/csit-noticeboard/ [500]: …`, and a browser check confirmed
three internal URLs present in the rendered admin DOM at 1280px. The same value was also being
written into `audit_events.metadata`, which the audit screen renders as JSON.

**Change.**

- `execute()` now builds the message from `relativePathPrefix`, so the internal host is never
  written again.
- New exported `redactLegacySourceDetails()` strips the configured source root and any residual
  scheme-and-authority from every scanner message that leaves the server, applied in
  `scannerStatus()`. This corrects **already-recorded** rows without rewriting history.
- The scanner completion audit record now stores `relativePathPrefix` only.
- `.status-banner-text` gained `overflow-wrap: anywhere`. The disclosure was also the cause of
  the scanner page's horizontal overflow: the unbroken URL could not wrap, giving a 109px
  scrollbar at 320px and 69px at 360px.

**VALIDATED.** `internalIPv4InDOM=false` in the scanner DOM. The diagnostic value is intact —
the message still names each unreadable location, its status code and the reason; only the
host and the source root are gone. Five unit tests cover the transform, including the exact
string that was in the database.

### 2.7 Focus restoration (#7, #11)

**Root cause.** Both modals are built on the Radix Dialog primitive, but neither is opened by a
`Dialog.Trigger` — the drawer by a plain `<button>`, the palette by a global `Ctrl/⌘-K`
shortcut. Radix can only hand focus back to a trigger it owns. Measured: after `Escape`, both
the public drawer and the admin drawer left `document.activeElement === document.body`, and so
did the command palette. A keyboard user who dismisses a menu is dropped at the top of the
document with no indication of where they were.

**Change.** New `src/components/useFocusRestore.ts`, used by both `Drawer` and
`CommandPalette`. It captures `document.activeElement` on open and restores it on close,
skipping a target that is no longer connected so focus can never be thrown onto a detached
node.

**VALIDATED.** After `Escape`: public drawer → `BUTTON.btn-ghost.btn-icon.header-toggle`;
admin drawer → `BUTTON.btn-ghost.btn-icon.app-mobile-menu`; command palette →
`BUTTON.site-header-search`. Previously all three were `BODY`. Focus trapping, focus-on-open
and background inertness were re-measured and still pass.

### 2.8 Scanner locked-state accessibility (#12)

**Root cause.** The locked import stage was conveyed by `opacity: 0.75` and a paragraph of
prose. There was no programmatic state at all — `aria-disabled` was absent, so a screen reader
had no way to know the stage was unavailable, and the disabled button is not focusable, so
`aria-describedby` on it would never be read either.

**Change.** The stage exposes `role="group"` + `aria-disabled="true"` + `aria-describedby`
pointing at the explanation when locked (a plain `aria-disabled` on `<section>` is not a valid
ARIA usage; `group` is), and a visible `badge-warning` "Import locked" so the state is not
signalled by dimming alone. The dry-run button stays enabled, correctly — a dry run writes
nothing.

**VALIDATED.** `aria-disabled=true` on the stage, import button disabled, reason text present
and referenced.

### 2.9 Login and authorization error semantics (#3, P13)

No backend detail ever reached the login response — `P10_PROGRESS.md` was right about that, and
it stays right. What was wrong was the status code. Every failure other than an origin
rejection was answered `400`, so a database outage was indistinguishable from a mistyped
password to anything reading status codes. The origin rejection is a genuine client error and
now stays `400`; everything else is a fault on this side and returns `503` with a generic
message.

The same inversion existed in the API layer: `requireAdmin()` throws `UNAUTHORIZED`, but the
six handlers whose `catch` mapped it through `publicErrorMessage` answered `400`. The `GET`
handler on the same resource answered `401`. New `authorizationErrorStatus()` in `http.ts`
maps the authorization error to `401` and leaves the route's own status otherwise; it is
applied to exactly those six handlers, found by searching for `requireAdmin`/`requireOwner` that
can actually throw into a catch.

**VALIDATED.** `POST /api/auth/login` with a malformed body → `503` generic, no internals;
cross-origin → `400`. `POST /api/admin/scanner` as a signed-in `USER` → `401`, matching its own
`GET`.

### 2.10 Unhandled exception on cross-origin sign-out (P14)

`POST /api/auth/logout` called `assertSameOrigin` with no `try`/`catch`, so a rejected
cross-origin sign-out produced an **unhandled 500 and a stack trace in the service journal** for
what is an ordinary rejected request. Two such entries were observed in the journal, both
triggered by this phase's own probes. Now caught and answered `400 "Origin check failed"`, like
every other mutation. The journal is clean of it since.

---

## 3. Test and build results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 warnings, 0 errors, 139 files |
| `npm test` | **18 files, 102 tests, all passing** (was 17 / 89) |
| `npm run build` | compiled successfully; `/login` static, all other routes dynamic |

Thirteen new tests, no existing test modified, skipped or weakened:

- `src/lib/status.test.ts` (8) — the scanner status vocabulary is checked **against the CHECK
  constraint read out of `db/006_legacy_scanner.sql`**, so the schema is the source of truth;
  partial-failure labelling; no two public-nav items are ever both current; `fragmentOnly` is
  never current; the path is resolved from the module, not `process.cwd()`, so it does not
  depend on the runner's working directory.
- `src/lib/legacy-scanner.test.ts` (+5) — source-detail redaction, including the exact string
  found in the production database, and the null/empty cases the status payload depends on.

---

## 4. Items investigated and deliberately not changed

- **Health endpoint metadata (#14).** Returns `ok`, `checks.{postgresql, storageRoot,
  storageWritable, diskUsagePercent, diskPressure}` and a timestamp, with `Cache-Control:
  no-store`. A live probe found no hostname, no filesystem path, no database name, no version
  string and no secret-shaped key. Disk utilisation is a deliberate part of a health probe
  contract, and P9 documented this response as intended. **No change.** Fixing it by removing
  diagnostics would have reduced operational value for no security gain.
- **Login response sanitisation (#3).** Already correct; kept. Only the status code changed.
- **Admin table keyboard access (#8).** Already correct in the working tree; re-verified rather
  than rewritten. At 360px the measured `scrollLeft` moved 0 → 40 on `ArrowRight` in a focused
  `.table-wrap`, which is the actual proof of keyboard scrollability.
- **Skip-link consistency (#5).** Already correct; re-verified. `#main-content` exists exactly
  once on all 20 measured routes, and activating the skip link with the keyboard lands focus on
  the target.
- **Non-existent or over-long archive folder returns 200, not 404.** Both the archive route and
  the department route behave identically — measured 200 on
  `?path=NO_SUCH_FOLDER_XYZ` and on a 600-character segment, with no filesystem content
  disclosed. This is pre-existing, consistent, non-leaking behaviour and the protected file's
  empty-state and out-of-range semantics are under a preserve instruction. **No change.**
- **`/favicon.ico` 404s.** Pre-existing, cosmetic, unrelated to any documented defect, and not
  a regression from this phase. **Recorded, not fixed.**
- **Journal entries of 2026-09-25 15:06–17:01** — 30 × `password authentication failed for user
  "college_noticeboard_app"`, and 7 × `could not determine data type of parameter $5` (PG
  `42P18`) at 20:05. Both are historical, both predate this phase, and neither recurs. The
  database is healthy now (`/api/health` → `postgresql: ok`) and the `42P18` run is one of the
  historical scanner rows still visible in the admin UI. **Not investigated further: no
  credential was touched, and there is no current fault to reproduce.** Recorded so the history
  is not mistaken for a live problem.

---

## 5. What is explicitly NOT VERIFIED

- **No automated axe/Lighthouse pass exists.** Accessibility was verified by measured DOM
  semantics and real keyboard interaction, not by an automated rules engine. The project's own
  P9 record notes this gap and it still stands.
- **No real-browser check on a physical iOS/Android device.** Viewport widths were emulated.
- **No screen-reader run.** Landmark and state changes were verified as DOM/ARIA attributes,
  not as spoken output.
- **Upload, replace, quarantine, purge, publish and recycle-bin mutations were not exercised
  end to end** in this phase. They were not touched by these changes; only their authorization
  rejection paths were probed.
- **The file corpus has no independent backup**, so a full environment restore is not
  demonstrated. See §6 of the README.

---

## 6. Files changed

Pre-existing P10 work in the working tree was **preserved and built on**, not rewritten. The
`table-wrap` accessibility attributes, the `.resource-list` investigation and the
`id="main-content"` addition from the earlier session are all still present and were verified
rather than re-implemented.

| File | Purpose |
|---|---|
| `src/app/archive/[...path]/page.tsx` | migrated off 20 undefined `.public-*` classes onto the shared archive components (protected file; only the documented defect remediated) |
| `src/app/departments/[department]/page.tsx` | one breadcrumb trail instead of two |
| `src/app/notices/[id]/page.tsx` | action row uses the existing `.toolbar` pair so it wraps |
| `src/components/Breadcrumbs.tsx` | the single breadcrumb implementation; `ol` semantics, `next/link` |
| `src/components/ArchiveBrowser.tsx` | delegates its trail to `Breadcrumbs`; prop now optional |
| `src/components/useFocusRestore.ts` | **new** — focus restoration for both modal surfaces |
| `src/components/Drawer.tsx` | uses the hook; docstring corrected |
| `src/components/CommandPalette.tsx` | uses the hook; docstring corrected |
| `src/components/PublicNav.tsx` | passes the nav item so `fragmentOnly` is honoured |
| `src/lib/public-nav.ts` | `fragmentOnly` implemented; a fragment shortcut is never a current page |
| `src/lib/status.ts` | scanner vocabulary matches the schema; `scannerRunOutcome` for partial failure |
| `src/lib/status.test.ts` | **new** — 8 tests, schema-derived |
| `src/lib/legacy-scanner.ts` | never records the internal URL; redacts on the way out |
| `src/lib/legacy-scanner.test.ts` | +5 redaction tests |
| `src/lib/http.ts` | `authorizationErrorStatus()` |
| `src/app/api/auth/login/route.ts` | origin failure 4xx, everything else 503, both sanitized |
| `src/app/api/auth/logout/route.ts` | origin rejection caught; no unhandled 500 |
| `src/app/api/admin/scanner/route.ts`, `scanner/retry/route.ts`, `admin/recycle-bin/{files,notices}/[id]/route.ts` | authorization failures answer 401 instead of 400 (6 handlers) |
| `src/styles/public.css` | `grid-template-columns: minmax(0,1fr)` on `.resource-list`; breadcrumb list reset; 380px hack removed |
| `src/styles/components.css` | `.status-banner-text` wraps long tokens |
| `infra/azure/nginx.conf` | brought in line with the installed configuration; HSTS documented |
| `P10_PROGRESS.md` | this report |
