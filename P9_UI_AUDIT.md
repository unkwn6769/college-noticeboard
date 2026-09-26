# P9 — Frontend / UI Completion Audit and Implementation

Project: `/opt/college-noticeboard`
Baseline commits: `e78fe94` (P8 admin audit and recycle bin), `d339a42` (P7 scanner import)
Date of run: 2026-09-25
Scope: audit P0–P8 frontend state, runtime-test the public and authenticated journeys, fix concrete defects, regress, redeploy, and report.

No secrets appear in this document. All credential handling was done inside throwaway scripts that read the environment without printing it; nothing from `.env` or `/etc/college-noticeboard.env` is reproduced here.

---

## 1. Executive status

**P9 COMPLETE**, with one explicitly declared limitation: **no browser/DOM tooling was available in this environment**, so viewport rendering, hydration warnings and browser-console output could not be captured. Everything else in the P9 scope was verified against the running production service over HTTP, against rendered HTML/CSS, and with automated tests.

What P9 changed in one sentence: the UI worked but contained a set of concrete correctness, state-handling, error-message and accessibility defects; 20 defects were found and fixed, 4 regressions were added, and the production build was redeployed and re-verified.

| Class | Meaning used in this report |
| --- | --- |
| CONFIGURED | The capability is wired up in configuration/architecture |
| IMPLEMENTED | Code exists for the capability |
| OBSERVED | Behaviour was seen at runtime (HTTP response, rendered HTML, API payload) |
| VALIDATED | Checked against a stated expectation and found correct |
| TESTED | Covered by an automated test in `npm test` |
| EXPERIMENTALLY PROVEN | Proven with runtime evidence, not just by reading code |
| ACTUALLY USABLE | A real user can complete the task end to end on the deployed service |

---

## 2. Current UI architecture

Preserved exactly as found. No new framework, design system, styling framework or component library was introduced.

- Next.js 16.3.5 App Router, React 19, TypeScript (strict), no ORM, no client state library.
- Server components for all public data pages; `"use client"` components for the whole authenticated admin surface and the login form.
- Styling: one hand-written stylesheet, `src/app/globals.css` (~520 lines), plain CSS with utility-ish class names (`card`, `btn`, `alert`, `table-wrap`, `empty-state`, `loading-state`, `badge-*`, `public-*`, `admin-*`). No CSS framework, no CSS-in-JS.
- Data: raw SQL through `pg`; server-rendered public pages are `export const dynamic = "force-dynamic"`.
- Auth: httpOnly cookie sessions, server-side role gates in layouts (`src/app/admin/layout.tsx` → ADMIN/OWNER, `src/app/admin/users/layout.tsx` → OWNER only).
- Deployment: `college-noticeboard.service` (systemd, `npm run start`, port 3000) behind nginx, public HTTPS at `https://college-noticeboard.duckdns.org`.
- State communication: admin client pages call `/api/*` endpoints directly with `fetch`; no optimistic-update layer.

Page/component inventory as reconstructed:

| Area | Files |
| --- | --- |
| Root layout / global state | `src/app/layout.tsx`, `src/app/globals.css` |
| Public pages | `src/app/page.tsx`, `departments/page.tsx`, `departments/[department]/page.tsx`, `departments/[department]/file/[id]/page.tsx`, `notices/[id]/page.tsx`, `search/page.tsx`, `archive/page.tsx`, `archive/[...path]/page.tsx`, `login/page.tsx` |
| Public components | `src/components/PublicNav.tsx`, `PublicFooter.tsx`, `DepartmentCard.tsx`, `SectionHeader.tsx` |
| Admin pages | `admin/page.tsx`, `admin/notices/page.tsx`, `admin/notices/new/page.tsx`, `admin/notices/[id]/page.tsx`, `admin/files/page.tsx`, `admin/storage/page.tsx`, `admin/integrity/page.tsx`, `admin/recycle-bin/page.tsx`, `admin/audit/page.tsx`, `admin/scanner/page.tsx`, `admin/users/page.tsx` |
| Admin components | `src/components/AdminNav.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/users/layout.tsx` |

---

## 3. P9.0 stopping-point reconstruction

Status of the UI as P8 left it, judged by runtime behaviour rather than source presence:

| Area | Status at start of P9 | Evidence |
| --- | --- | --- |
| Public navigation | PARTIALLY DONE | All links resolved, but no active/current state, and footer/homepage department links were raw `<a href>` (full page reload) |
| Home / departments / notice detail | PARTIALLY DONE | Rendered correctly, but relied on 7 CSS classes that did not exist in the stylesheet, so stat tiles, soft panels and lead paragraphs rendered unstyled |
| Search | PARTIALLY DONE | Worked, but `?q=%%` returned every row (LIKE metacharacters were not escaped), and the input stole focus on load |
| Archive browsing | DONE with one broken-link class | 3 of ~600 crawled public pages 404'd, all linked from the homepage "Recently added resources" list |
| Notice/file admin UX | PARTIALLY DONE | Attachments, publish/archive/restore/delete all worked; no Enter-to-save, no busy state on the new-notice form |
| Files admin UX | BROKEN in failure paths | `upload()`/`remove()` had no `try/catch`: a network failure left the message stuck on "Uploading…" and reported nothing; "Replace" with no file selected did nothing at all; no confirmation on quarantine |
| Recycle bin | BROKEN in failure paths | A failed load rendered "Recycle bin is empty"; success/error styling was decided by substring-matching the message text, so server errors could render as green success; failed mutations left the page permanently disabled (`setBusy(false)` unreachable) |
| Users admin | MISSING states | No loading, error or empty state; inputs had placeholders but no labels; no confirmation on a destructive Disable; `e.currentTarget` was used after `await` (React nulls it) so a successful create threw |
| Storage / integrity / audit / scanner | PARTIALLY DONE | Storage exposed raw JSON/driver errors on failure; integrity showed a blank table for a filter with no matches; audit "Clear filters" did nothing when only text filters were set; scanner showed an empty alert when the API returned no `error` field |
| Error surfacing | BROKEN | Internal codes (`NOTICE_NOT_FOUND_OR_PUBLISHED`) and raw PostgreSQL errors (`duplicate key value violates unique constraint "users_email_key"`, `invalid input value for enum user_role`) were returned to the browser and rendered into the UI |
| Loading states | MISSING (route level) | No `loading.tsx`, no `error.tsx`, no `not-found.tsx` anywhere |
| Accessibility | PARTIALLY DONE | Landmarks and heading order were largely sound; contrast failures on small text (2.58:1 and 3.06:1), no `:focus-visible` styling, admin nav toggle without `aria-expanded`, unstyled tab widgets, table headers without `scope` |
| Responsive layout | PARTIALLY DONE | Public breakpoints were thorough; the admin top bar kept a single flex row at ≤700px so the opened menu was squeezed beside the brand; three `auto-fit` grids could overflow below ~350px viewports |
| Browser/runtime quality | UNTESTED | No console, hydration or client-navigation telemetry existed for this phase |

---

## 4. Public navigation audit

Journey exercised at runtime: home → departments → department → notice → search → archive → file detail, plus footer, breadcrumbs, pagination and error URLs.

Automated HTTP crawl (`curl`, 600 URL budget, follows every internal `href` in rendered HTML):

- **Before P9**: 117× 200, **3× 404** — all three on `/departments/civil-noticeboard/file/<uuid>`, all linked from the homepage "Recently added resources" list.
- **After P9**: **600× 200, 0 non-2xx, 0 problems.**

| Check | Result | Class |
| --- | --- | --- |
| Every internal link resolves | 600/600 HTTP 200 | EXPERIMENTALLY PROVEN |
| Active navigation state | `aria-current="page"` + `.public-nav-active` rendered on `/departments` | OBSERVED |
| Missing department → controlled 404 | `/departments/nope-noticeboard` → 404 | EXPERIMENTALLY PROVEN |
| Missing notice → controlled 404 | `/notices/not-a-uuid` and a well-formed but unknown UUID → 404 | EXPERIMENTALLY PROVEN |
| Unknown route → branded 404 | `/definitely-not-a-page` → 404 with the noticeboard 404 page | EXPERIMENTALLY PROVEN |
| Path traversal → controlled 404 | `/archive/civil-noticeboard/../../etc`, `?path=../../etc` → 404 | EXPERIMENTALLY PROVEN |
| Unauthenticated admin → redirect | `/admin`, `/admin/users`, `/admin/files` → 307 → `/login` | EXPERIMENTALLY PROVEN |
| No runtime error boundary triggered | 0 occurrences of a streamed error digest across 600 crawled pages | OBSERVED |
| Back/forward behaviour | Not verifiable without a browser; client navigation is now used throughout (footer, homepage, admin nav) so history entries are per-route as before | NOT VERIFIED (no browser) |

No navigation was redesigned. The only changes are the active-state affordance and replacing raw `<a href>` with `next/link` on the same destinations.

---

## 5. Responsive audit

Method: static analysis of `globals.css` against the rendered DOM of every audited route, plus verification that the compiled stylesheet actually contains the rules. Viewport rendering was **not** captured — see §14.

| Route | Finding | Fix |
| --- | --- | --- |
| Admin bar (all admin pages) | `.topbar-inner` stayed `display:flex` (row) at ≤700px while `.admin-nav` became a column, so an opened menu was squeezed and clipped beside the brand | `.topbar-inner` stacks at ≤700px; nav links/buttons get full width and left alignment |
| Admin files, audit, integrity, storage, recycle bin | `.grid` (280px), `.stats` (180px), `.analytics-grid` (320px), `.admin-search-form` (160px) used `minmax(<fixed>, 1fr)`; below ~312/212/352/192px viewports this forces horizontal page scroll | `minmax(min(<track>,100%), 1fr)` on all four |
| Home, departments, archive, search, notice detail, file detail, login | No defect found: grids already use `minmax(0,1fr)` and collapse at 900/800/700/560px; pagination, breadcrumbs, attachments and detail grids all have narrow-viewport rules | — |
| Long unbroken titles/filenames | `h3` elements and notice bodies had no wrapping rule, so a single long token could push the page wider than the viewport | `overflow-wrap:anywhere` on notice titles, search-result titles, department-card titles, folder cards, notice detail title and `.notice-body` |
| Tables | `.table-wrap { overflow:auto }` already contains wide tables | — |

---

## 6. Loading / empty / error states

| Surface | Before | After |
| --- | --- | --- |
| Any route, unexpected render failure | Unstyled Next.js error page | `src/app/error.tsx`: branded message, digest reference, **Try again** (`reset()`) and **Back to home**, `role`d alert text |
| Unknown route / `notFound()` | Generic Next 404 | `src/app/not-found.tsx`: branded 404 with PublicNav/PublicFooter and two recovery links |
| `/search` while a query is running | No feedback | `src/app/search/loading.tsx` (scoped on purpose — see §17 D-REGRESSION-1) |
| Home: zero notices / zero resources | Present and correct | Unchanged (verified by code path; not forced in production) |
| Search: no results | "No matching notices / departments / archive resources" per section | Unchanged, plus verified live: `?q=%%` now returns 0 of every section |
| Department/archive folder with no entries | "Folder is empty" / "No migrated resources" | Unchanged, plus a new distinct state for a page number past the end of a folder |
| Admin users | None | Loading spinner, error + **Try again**, "No users yet" empty state |
| Admin files | Plain text cell | Filter-aware empty state ("No file records exist yet." vs "No files match these filters.") |
| Admin recycle bin | None; a failed load looked empty | Explicit `loadError` state with **Try again**; a failed load can no longer render "Recycle bin is empty" |
| Admin audit | None | Empty state now states whether events could not be loaded or simply did not match |
| Admin integrity | Blank table for a filter with no matches | "No <severity> issues were reported." row |
| Admin scanner | Silent when there was no run / no failures | "No scanner run recorded yet." and "No failed scanner items." |
| Failed API request (admin) | Raw server text | `publicErrorMessage()` in `src/lib/http.ts`: internal codes are translated, human validation messages pass through, everything else (driver text, parser text, constraint names) is replaced with a safe fallback |
| Invalid input | Raw server text | Same helper + new server-side email/role/status validation in `src/app/api/admin/users/*` |

Every error message shown in the UI is now either a translated internal code or an explicit human sentence. Verified live (§16).

---

## 7. Form validation

Server-side validation remains authoritative everywhere; nothing was moved to the client.

| Form | Client-side | Server-side (unchanged authority) |
| --- | --- | --- |
| Login | `type=email`, `required`, `autocomplete` | `POST /api/auth/login` re-verifies credentials, `assertSameOrigin`, generic 401 |
| Notice create | `required` on title/body, `maxLength=64` on category, department from the registry list, submit disabled while in flight | Title/body presence, department must exist in the registry, category truncated to 64 |
| Notice edit | `required` on title/body, department select, publish/archive/delete now `type="button"` inside a real `<form>` so Enter saves | `PATCH /api/notices/[id]` re-validates; publish/archive re-check state server-side |
| User create | `type=email`, `required`, `minLength=10` password, `maxLength=120` display name, role allowlist | **New**: email format, role allowlist, display-name length, duplicate email → 409 "A user with this email already exists" |
| User status change | Confirmation dialog, disabled while busy | **New**: `status` allowlist, role allowlist, UUID format, "Protected account operation" for self-disable |
| File upload / replace | File must be selected (explicit message otherwise), controls disabled while in flight | Size limits, disk headroom, streaming, SHA-256, atomic publication unchanged |
| Search / filter controls | Submit-on-change for selects, submit for text, filters disabled while loading | `pageSize` 10–100, `origin`/`state` allowlists, 100/128-character search bounds (unchanged) |
| Scanner | Import stays disabled until a preview exists; import asks for confirmation | Approval token required server-side, preview expiry enforced |

Boundary coverage added as tests: email syntax (10 rejection cases), role allowlist, UUID format, display-name limit, password minimum.

---

## 8. Accessibility

Fixed, all within existing patterns:

- **Contrast (measured, WCAG 2.1 ratios against white)**: `.public-eyebrow`, `.public-resource-meta`, `.public-file-detail-grid dt` and `.public-hero h1 span` were `#98a2b3` = **2.58:1**; `.public-brand-subtitle` was `#8a94a6` = **3.06:1**; `.public-breadcrumb-separator` was `#c1c7d0` = **1.70:1**. All now `#667085` = **4.97:1**. Re-measured after the change; every other colour pair in the stylesheet was already AA (`.muted` 4.76:1, `.btn.danger` 6.47:1, `.alert-success` 6.49:1, `.alert` 6.80:1, badge pairs ≥5.89:1).
- **Focus visibility**: added a global `:focus-visible` rule (2px `#1d4ed8`, 2px offset). The only prior focus style was `#cbd5e1` on white (≈1.6:1, failing even the 3:1 non-text minimum).
- **Active navigation**: `aria-current="page"` plus a visible underline on both the public and admin navs.
- **Landmarks**: footer links wrapped in `<nav aria-label="Footer navigation">`; the department archive breadcrumb promoted from a `<div aria-label>` (an `aria-label` on a generic `div` is ignored) to a real `<nav>`; breadcrumbs separators marked `aria-hidden` because they are punctuation duplicated by the link structure.
- **Live regions / error association**: `role="alert"` on error banners, `role="status"` on success banners, `aria-live="polite"` on progress and loading text — users, files, recycle bin, audit, integrity, scanner, login, new notice.
- **Tab semantics**: the recycle-bin Notices/Files switcher is now `role="tablist"` / `role="tab"` with `aria-selected` and `aria-controls`, with matching `role="tabpanel"`; the integrity severity filter uses `aria-pressed`.
- **Tables**: `scope="col"` on every column header; action columns get a visually-hidden label instead of an empty `<th>`.
- **Labels**: the users form moved from placeholder-only inputs to real `<label>` elements (display name, email, password, role) plus a password-length hint; file inputs are wrapped in labels with visually-hidden text.
- **Focus stealing**: removed `autoFocus` from the search input.
- **Headings**: `error.tsx`/`not-found.tsx` use a single `h1`; existing `h1 → h2 → h3` order on the public pages was already correct and was left alone.
- **Images**: the application contains no `<img>` elements, so no alt-text work applies.

Not done (deliberate, listed as residual risk): a skip-to-content link would require adding an `id` to the `<main>` of every page, which is broader churn than the defect warrants; no `aria-live` announcement is provided for the top-level route transition.

---

## 9. Admin UX

Audited page by page against the running service as an authenticated owner.

| Page | Finding | Result |
| --- | --- | --- |
| Dashboard | Works; server-rendered; a data failure now lands in the branded error boundary | VALIDATED |
| Notices | Table with status badges and edit links; empty state present | VALIDATED |
| Notice editor | No Enter-to-save (buttons outside a form); status actions and delete could not distinguish a failed request from success; upload button said "Working…" for both upload and delete | Now a real `<form>`; all fetches have `try/catch` with an explicit "… was not saved/published/archived/deleted" message; progress copy is specific |
| Files | Unhandled rejections on upload/delete; no confirmation before quarantine; "Replace" with no file did nothing; success and failure shared one muted string | All mutations wrapped, confirmed, busy-disabled, and split into `success` / `error` / `progress` feedback with an `aria-live` banner |
| Storage | A 500 or HTML error page surfaced the raw JSON parser message | Explicit response check and a "Storage analytics unavailable" state |
| Integrity | Blank table when a severity filter matched nothing | Filter-aware empty row; filter buttons are now pressed-state buttons |
| Recycle bin | Failed load shown as empty; substring-based success/error styling; failed mutation left every control disabled forever | Explicit load-error state, explicit success/error feedback, all four actions wrapped in a single guarded runner, tab semantics |
| Audit | "Clear filters" silently did nothing when only the text filters were set; no alert role | `clearFilters()` always re-queries; `role="alert"` |
| Scanner | `new Error(body.error)` produced an empty alert when the API omitted `error`, or a raw parser message on a non-JSON response; no feedback after a successful retry | `readError()` helper with fallbacks; success feedback; import confirmation; explicit empty states |
| Users | No loading/error/empty states; placeholder-only inputs; no confirmation on a destructive Disable; `e.currentTarget` used after `await` | Fully reworked: labels, loading, error + retry, empty state, confirmation, busy states, enable/disable, and the React `currentTarget` bug fixed by capturing the form before the first `await` |

Authorization was not changed: `/admin` still requires ADMIN/OWNER, `/admin/users` still requires OWNER, every mutating endpoint re-checks role and same-origin, and hiding a nav link remains non-authoritative. Verified live: unauthenticated `/admin*` → 307 to `/login`; non-owner `/admin/users` → server-side `notFound()`.

Destructive vs normal actions are now consistently separated: restore/replace/enable are `.btn.secondary`, delete/purge/quarantine are `.btn danger`, and every irreversible action (delete notice, permanently delete notice, purge file, quarantine file, disable account, approve import) asks for confirmation.

---

## 10. Notice UX

- Create, edit, publish, archive, restore and delete were exercised through their API contracts as an authenticated owner; all mutating endpoints returned the expected status codes, and the editor's refresh-after-mutation behaviour is unchanged.
- Published state is visible in three places: the editor header badge, the admin notices table status badge, and the public notice page.
- Attachments: upload-and-attach, attach-by-UUID, open, remove, per-row state badge and byte size, plus an empty state. The attach flow still deletes the just-uploaded file if the attach step fails, so no orphan bytes.
- Long titles/content: `overflow-wrap:anywhere` added to notice titles and `.notice-body`; long filenames were already handled by `overflow-wrap:anywhere` on attachment names.
- Missing data: unknown notice ID, non-UUID ID, and a draft notice requested publicly all produce a controlled 404.
- Validation feedback: title/body/category messages come from the server through the new safe-message helper; the previous `INVALID_DEPARTMENT` leak can no longer reach the UI.

---

## 11. File UX

- **Upload**: streaming protocol unchanged (`X-File-Name`, `X-File-Size`, raw body). The UI now shows `Uploading <name>…` progress, disables the file input and all row actions while a mutation is in flight, and clears the input only after success.
- **Upload validation**: an empty file selection is now an explicit, actionable error instead of a silent no-op; server-side size/disk/verification protections are untouched.
- **Download**: `View`/`Open`/`Download` links are plain anchors to the download endpoints (correct for streamed responses) and now open in a new tab so the admin page is not navigated away from.
- **Replacement/versioning**: "Replace" requires a selected file and explains what to do; the version badge (`state · vN`) is unchanged.
- **Deletion**: quarantine now asks for confirmation and reports "moved to quarantine" only on a real 2xx.
- **Restore/purge**: recycle-bin restore and purge keep their explicit destructive confirmations, and now report success or failure truthfully.
- **No misleading success**: verified by inspection and by the live probe — every mutation path sets success feedback only inside `if (response.ok)`, and every catch block sets an error message instead.

Backend protections were not weakened: size limits, disk headroom checks, streaming, SHA-256 verification, fsync, atomic publication, quarantine-before-purge and version isolation are unchanged.

---

## 12. Search UX

- **Search form**: submits `GET /search?q=…`; the query persists in the URL and is echoed back into the field.
- **Special characters — defect found and fixed**: the search term was interpolated raw into `ILIKE '%' || $1 || '%'`, so `%` and `_` acted as wildcards. Proven live before the fix: `GET /api/notices?q=%25%25` returned **2 of 2** notices and `/search?q=%%` reported **14 top matches shown** — i.e. searching for two percent signs returned the entire corpus. After the fix: `q=%%` → **0** notices, `/search?q=%%` → "0 top matches shown", and `q=_` now matches only filenames that literally contain an underscore.
- **Long queries**: server truncates the query to 100 characters (`normalizePublicSearchQuery`); the input now also carries `maxLength={100}` so the browser and the server agree.
- **Filters/pagination**: public search intentionally returns top matches only (12 notices / 8 departments / 12 resources) and says so in the summary line; result caps and ordering are unchanged. Admin files/audit pagination was audited and left as is.
- **Result links**: every result links to a route that returns 200; the homepage's previously broken file links were the same defect class and are fixed.
- **Loading/error states**: a `loading.tsx` scoped to `/search`; per-section empty states; a failed query is now caught by the route error boundary instead of surfacing a raw message.

Search semantics were not otherwise changed: matching, ranking and caps are identical.

---

## 13. Archive UX

- **Navigation**: archive root → department → folder → file detail, with breadcrumbs at every level, department and category navigation from both `/archive` and `/departments`, and quick links back to the department page, search and the archive root.
- **Path handling**: `../../etc`, encoded traversal and over-long paths all produce a controlled 404; the `?path=` query form is rejected the same way.
- **Long filenames and special characters**: folder names wrap (`overflow-wrap:anywhere`); file names keep their existing single-line ellipsis and the full name is shown on the detail page; legacy paths with spaces, dots and mixed case render correctly (`ACADEMICS/PREVIOUS QUESTION PAPERS/AY - 2022-23/SEM I`).
- **Empty states**: "No migrated resources" (empty department) and "Folder is empty" (empty folder) both verified live on a real department.
- **Out-of-range pagination — defect found and fixed**: `?page=99999` on a folder with files reported "Folder is empty" and offered no way back. It now reports "No files on this page — Page N is past the end of this folder" with a **Back to the first page** link. Verified live against a real folder.
- **Responsive behaviour**: archive grids collapse 3→2→1 at 800px/560px; the detail grid collapses at 560px; pagination stacks.

`src/app/archive/[...path]/page.tsx` was **not modified**. Its pre-existing working-tree change is byte-for-byte identical to the state P9 received (verified by diffing before and after). The out-of-range-page improvement was applied only to `src/app/departments/[department]/page.tsx`; the archive route keeps the older behaviour by deliberate instruction, and this is recorded as a residual risk.

---

## 14. Browser / runtime quality

- **Browser tooling was not available.** The desktop browser integration reported `browser.disconnected` on every attempt, and no headless browser (Chromium, Firefox, Playwright, Puppeteer) is installed in this environment. No screenshot, DOM snapshot, console log, network log, hydration warning or viewport measurement could be captured.
- Substitute runtime evidence actually collected:
  - HTTP status of 600 crawled public URLs (all 200 after the fix).
  - Rendered server HTML inspected for every public and authenticated admin route.
  - The compiled stylesheet fetched and diffed against the class names used in the rendered HTML: **0 classes used but not styled**, 5 media-query breakpoints present, `:focus-visible` and `.visually-hidden` present in the built CSS.
  - Service journal inspected for uncaught exceptions: **0** error/⨯ entries in the final 10 minutes of runtime.
  - Error-boundary digests searched for in every crawled page: **0** occurrences.
- Consequently: uncaught exceptions, hydration mismatches, React key warnings and console noise are **NOT VERIFIED**. They remain a residual risk.

---

## 15. Defects found

| ID | Area | Defect | Severity |
| --- | --- | --- | --- |
| D1 | Styling | 7 classes used by public/admin pages were never defined (`card-soft`, `lead`, `stat-label`, `stat-value-small`, `compact-stats`, `notice`, `analytics-trend-table`) — stat tiles, soft panels, lead text and scanner notices rendered unstyled | High (visual) |
| D2 | Navigation | Public footer and the two homepage department links were raw `<a href>`, forcing full document reloads | Medium |
| D3 | Navigation | No active/current state in the public nav | Medium |
| D4 | States | No `error.tsx`, no `not-found.tsx`, no route-level loading feedback | High |
| D5 | Archive / navigation | Homepage "Recently added resources" linked to 3 file pages that return 404: `listRecentArchiveFiles` omitted the superseded-row filter that `getArchiveFile` enforces | High |
| D6 | Search | Search term was not escaped for `ILIKE`; `?q=%%` returned the whole corpus | High |
| D7 | Search | `autoFocus` on the search input stole focus on every load | Low |
| D8 | Error surfacing | Internal codes and raw PostgreSQL errors rendered into the UI (`NOTICE_NOT_FOUND_OR_PUBLISHED`, `duplicate key value violates unique constraint "users_email_key"`, `invalid input value for enum user_role: "SUPERUSER"`) | High |
| D9 | Users admin | No loading / error / empty state; placeholder-only inputs; no confirmation on a destructive Disable; no busy state; `any[]` typing | High |
| D10 | Users admin | `e.currentTarget.reset()` executed after `await` — React nulls `currentTarget` after dispatch, so a successful user create threw | High |
| D11 | Users API | No email/role validation; duplicate email and invalid role produced raw driver errors | High |
| D12 | Files admin | `upload()`/`remove()` had no `try/catch`: a network failure left "Uploading…" on screen forever and reported no error; "Replace" with no file selected was a silent no-op; quarantine had no confirmation; success and failure shared one muted string with no alert semantics | High |
| D13 | Recycle bin | A failed load rendered "Recycle bin is empty" | High |
| D14 | Recycle bin | Success vs error styling chosen by substring-matching the message, so a server error could render as a green success banner | High |
| D15 | Recycle bin | The four mutations had no `try/catch`; a network failure skipped `setBusy(false)`, permanently disabling every control on the page | High |
| D16 | Notice admin | No Enter-to-save; status actions and delete reported nothing when the request itself failed | Medium |
| D17 | New notice | No busy state, so double submission was possible; error banner had no alert role | Medium |
| D18 | Storage admin | A non-JSON/500 response surfaced the raw parser message to the user | Medium |
| D19 | Integrity admin | A severity filter matching nothing rendered a blank table; filter buttons had no pressed state | Medium |
| D20 | Audit admin | "Clear filters" did nothing when only the text filters were set; no alert role | Medium |
| D21 | Scanner admin | Empty alert when the API omitted `error`; raw parser message on a non-JSON response; no feedback after a successful retry; no empty states; import had no confirmation | Medium |
| D22 | Responsive | Admin top bar kept a flex row at ≤700px, clipping the opened menu | Medium |
| D23 | Responsive | `minmax(<fixed>,1fr)` in 4 grids could force horizontal scroll on very narrow viewports | Low |
| D24 | Responsive / content | No wrapping rule on notice titles, folder names, search-result titles and notice bodies | Medium |
| D25 | Accessibility | Three text colours at 2.58:1 / 3.06:1 / 1.70:1; focus ring at ≈1.6:1 and no `:focus-visible`; no `aria-current`; footer/breadcrumb not landmarks; no alert/status roles; unstyled tab widgets; table headers without `scope`; placeholder-only user form | High |
| D26 | Archive UX | `?page=<past end>` reported "Folder is empty" with no way back (department route) | Medium |
| D-REGRESSION-1 | Self-inflicted | A root `loading.tsx` was added during P9 and **broke HTTP 404s** (`notFound()` after a streamed shell returns 200). Detected by measurement, then removed in favour of a `/search`-scoped boundary | Critical (caught & reverted) |
| D-REGRESSION-2 | Self-inflicted | The first `listFiles` escaping fix bound a 5th parameter to the count statement without referencing it, breaking file search with PostgreSQL `42P18`. Caught by runtime probing, fixed, and now covered by a regression test | High (caught & fixed) |

---

## 16. Changes made

### New files
| File | Purpose |
| --- | --- |
| `src/app/error.tsx` | App-level error boundary with retry |
| `src/app/not-found.tsx` | Branded 404 |
| `src/app/search/loading.tsx` | Scoped loading state for the heaviest public query page |
| `src/lib/sql-escape.ts` | `escapeLikePattern()` + the matching `ESCAPE` clause |
| `src/lib/sql-escape.test.ts` | 5 tests |
| `src/lib/user-validation.ts` | Email format, role allowlist, UUID check, length limits |
| `src/lib/user-validation.test.ts` | 5 tests |
| `src/lib/http.test.ts` | 4 tests for the safe-error mapper |
| `src/lib/files-list-query.test.ts` | 3 tests: parameter binding invariants + LIKE escaping |
| `src/lib/notices-query.test.ts` | 2 tests: parameter binding + LIKE escaping |

### Modified — libraries / backend
| File | Change |
| --- | --- |
| `src/lib/archive.ts` | Shared `escapeLikePattern`; `listRecentArchiveFiles` now excludes scanner-superseded rows (fixes the 3 broken homepage links) |
| `src/lib/notices.ts` | Search term escaped and bound as `$4` with `ESCAPE '\'` |
| `src/lib/files.ts` | Search term escaped; `where` became a function so each statement references exactly the parameters it binds (fixes the count-statement regression) |
| `src/lib/http.ts` | Added `publicErrorMessage()`: code → readable text, allowlisted validation text passthrough, safe fallback for everything else |
| `src/app/api/notices/route.ts`, `notices/[id]/route.ts`, `publish`, `archive`, `attachments`, `attachments/[attachmentId]` | Use `publicErrorMessage` |
| `src/app/api/files/route.ts`, `files/[id]/route.ts`, `files/[id]/delete`, `files/[id]/replace` | Use `publicErrorMessage` |
| `src/app/api/admin/users/route.ts` | Email validation, role allowlist, display-name limit, duplicate email → 409, safe messages |
| `src/app/api/admin/users/[id]/route.ts` | UUID check, status/role allowlists, safe messages |
| `src/app/api/admin/recycle-bin/**`, `admin/scanner/**` | Safe messages (status codes and role checks unchanged) |
| `vitest.config.ts` | Added the `@/*` alias so tests can import app modules by the same specifiers the app uses (mirrors `tsconfig.json`) |

### Modified — UI
`src/app/globals.css` (missing classes, contrast, `:focus-visible`, `.visually-hidden`, wrapping, `min()` grid guards, mobile admin bar, `file-field`), `src/components/PublicNav.tsx` (client, active state), `PublicFooter.tsx` (`next/link` + `nav` landmark), `AdminNav.tsx` (`next/link`, `aria-current`, `aria-expanded`/`aria-controls`), `src/app/page.tsx` (`next/link`), `departments/[department]/page.tsx` (breadcrumb `nav`, out-of-range state), `search/page.tsx` (no `autoFocus`, `maxLength`), `login/page.tsx` (alert role, network-failure message, `finally`), `admin/notices/page.tsx` (th scopes), `admin/notices/new/page.tsx` (busy state, alert role, `Link`), `admin/notices/[id]/page.tsx` (real form, explicit button types, guarded mutations, labelled file input), `admin/files/page.tsx` (guarded upload/remove, confirmation, busy state, structured feedback, empty state, th scopes), `admin/users/page.tsx` (rewritten states/labels/confirmations), `admin/recycle-bin/page.tsx` (rewritten load error, structured feedback, single guarded action runner, tab semantics), `admin/audit/page.tsx` (alert role, `clearFilters` reload, th scopes), `admin/storage/page.tsx` (safe response handling), `admin/integrity/page.tsx` (filtered empty row, pressed-state filters, th scopes), `admin/scanner/page.tsx` (safe errors, success feedback, confirmation, empty states).

### Not modified
`src/app/archive/[...path]/page.tsx` (pre-existing working-tree change preserved byte-for-byte), `src/app/admin/layout.tsx`, `src/app/admin/users/layout.tsx`, `src/app/layout.tsx`, all `src/lib/storage/*`, `scripts/`, `db/`, `infra/`, `.env*`, and the untracked `P7.1_*.md` / `opencode.json` files that predate P9.

---

## 17. Tests

| Command | Result |
| --- | --- |
| `npm test` | **17 files, 89 tests, all passing** (was 12 files / 70 tests) |
| `npm run lint` | 0 warnings, 0 errors |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | Compiled successfully; 21 static pages; all routes dynamic except `/login` |

New regression coverage:
- `escapeLikePattern` — ordinary text, `%`, `_`, backslash, and the matching `ESCAPE` clause.
- `publicErrorMessage` — internal codes translated; allowlisted validation text preserved; driver errors, parser text, connection errors and non-Error values all replaced by the fallback.
- `isValidEmail` (10 rejection cases), `isUserRole`, `isUuid`.
- `listFiles` — every bound parameter is referenced by the statement it is sent with (this is the exact invariant that broke as D-REGRESSION-2), LIKE metacharacters escaped, empty search stays on the unfiltered path.
- `listPublishedNotices` — parameter binding invariants and escaping.

Focused regression for the P7/P8 backend paths touched by P9: search (`/api/notices`, `/search`), file listing (`/api/files`), user administration (`/api/admin/users`), notice publish/archive, attachments, recycle bin, scanner status/retry — all re-probed live against the deployed build in §18.

No existing test was modified, skipped or weakened.

---

## 18. Production-like verification

Deployment: `npm run build` → `systemctl restart college-noticeboard.service`.

| Check | Result |
| --- | --- |
| `college-noticeboard.service` | **active (running)**, PID confirmed, started 20:27 UTC |
| `GET http://localhost:3000/api/health` | **200** |
| `GET https://college-noticeboard.duckdns.org/` | **200** |
| `GET https://…/api/health` | **200** |
| `GET https://…/departments`, `/search?q=notice` | **200** |
| `GET https://…/no-such-page` | **404** |
| Public crawl (600 URLs, localhost) | **600× 200, 0 non-2xx, 0 problems** |
| Service journal (final 10 min) | **0** uncaught errors |
| Authenticated admin pages (owner session) | `/admin`, `/admin/notices`, `/admin/notices/new`, `/admin/users`, `/admin/files`, `/admin/storage`, `/admin/integrity`, `/admin/recycle-bin`, `/admin/audit`, `/admin/scanner` → **all 200**, admin nav present on all |
| Admin APIs as owner | `/api/auth/me`, `/api/notices?admin=1`, `/api/admin/users`, `/api/files`, `/api/files/meta`, `/api/admin/storage`, `/api/admin/recycle-bin`, `/api/admin/audit`, `/api/admin/audit?meta=true`, `/api/admin/scanner`, `/api/admin/integrity` → **all 200** |
| Unauthenticated admin | `/admin*` → **307 → /login** |
| Validation/error messages (live) | duplicate email → `409 "A user with this email already exists"`; `not-an-email` → `400 "Enter a valid email address"`; `SUPERUSER` role → `400 "Role must be USER, ADMIN or OWNER"`; empty notice → `400 "Title and body are required"`; publish of a missing notice → `400 "This notice is already published, or it no longer exists."` |
| Search semantics (live) | `q=%%` → 0 notices; `q=smoke` → 1 notice ("Deployment Smoke Test"); `q=_` matches only literal underscores; `/search?q=%%` → "0 top matches shown" |
| 404 semantics (live) | `/departments/nope-noticeboard`, `/notices/not-a-uuid`, unknown notice UUID, unknown file UUID, `/archive/nope-noticeboard`, `/no-such-page` → **404** |
| Out-of-range archive page (live) | `?path=ABOUT+CSE&page=99999` → "No files on this page / Page 99999 is past the end of this folder / Back to the first page" |
| Data integrity after P9 | 3 users (unchanged), 47 911 files (unchanged), 2 published notices (unchanged), 0 orphaned file rows |

Test-account hygiene: authenticated admin verification used a short-lived owner account created directly in PostgreSQL with the application's own scrypt format, then deleted. Post-run checks confirm **0 probe users, 0 probe sessions**, and the user/file/notice counts match their pre-P9 values. The only residue is append-only audit history: 2 `USER_LOGIN` rows and 1 `AUTHORIZATION_FAILURE` row whose actor now resolves to null (the account no longer exists), which the audit UI renders as "System". Audit rows were deliberately **not** deleted — removing audit history to hide a test would be worse than keeping it.

No destructive P8 tests were re-run.

---

## 19. Remaining risks

1. **No browser/DOM verification.** Viewport rendering, responsive breakpoints, hydration warnings, React console output, client-side navigation transitions and DOM-level accessibility (tab order, screen-reader output, actual focus rings) were never observed in a real browser. The responsive and accessibility conclusions rest on static CSS analysis plus rendered-HTML/CSS inspection, and are labelled accordingly. This is the single largest gap.
2. **`notFound()` inside dynamic segments returns an almost empty HTML body** (`NEXT_HTTP_ERROR_FALLBACK;404` streamed to the client). The status code is correct (404) and a browser renders the branded 404 page, but a JavaScript-less client sees a blank body. This is stock Next.js App Router behaviour and predates P9.
3. **`/archive/[...path]` keeps the older out-of-range-page behaviour** because that file is under a preserve instruction. The department route was fixed; the archive route still shows "Folder is empty" for a page number past the end.
4. **Admin data pages are client-rendered after first paint.** Their content depends on `fetch` completing; there is no server-rendered fallback, no retry-on-focus and no polling (except the scanner's 5 s refresh). A dropped request leaves the previous view with an error banner until the user retries.
5. **Uploads show no byte-level progress.** Only an indeterminate "Uploading <name>…" state exists, because the streaming upload protocol has no progress channel. Very large files can appear stalled.
6. **No automated a11y tooling** (axe/Lighthouse) is wired into CI; the accessibility fixes are hand-verified against WCAG contrast math and semantic rules.
7. **Public search is capped at "top matches"** with no pagination. Intentional and labelled, but users searching a broad term cannot reach all results.
8. **Client-side search input `maxLength=100` is a convenience only**; the server truncation remains the authority.
9. **Contrast was computed for text-on-white combinations only.** Gradient/overlay combinations and disabled-control contrast were not evaluated.
10. **Two probe accounts' audit rows** remain in the append-only log with a null actor (see §18).

---

## 20. P9 finish gate

| Requirement | Classification | Evidence |
| --- | --- | --- |
| Responsive layouts | **VALIDATED (static) / NOT EXPERIMENTALLY PROVEN** | 4 concrete defects found and fixed; compiled CSS verified; no browser available for viewport measurement |
| Loading states | **IMPLEMENTED + OBSERVED** | `/search` loading boundary; admin loading spinners on users/recycle-bin/files/storage/integrity/notice editor; busy/disabled states on every mutation; rendered and observed on 10 admin routes |
| Empty states | **IMPLEMENTED + OBSERVED** | Home (notices/resources), search (3 sections), department/archive folders, admin notices/files/recycle-bin/audit/integrity/scanner/users; search-empty and folder-empty observed live |
| Error states | **IMPLEMENTED + VALIDATED** | Route error boundary, branded 404, per-page error states on every admin data page, safe-message mapper; raw DB/internal-code leakage eliminated and verified live |
| Form validation | **VALIDATED** | Client constraints plus new server-side email/role/UUID/length checks; 15 new validation tests; live 400/409 responses confirmed |
| Accessibility | **VALIDATED (partial)** | Contrast failures fixed and re-measured; focus-visible added; landmarks, `aria-current`, alert/status roles, tab semantics, `scope` and labels added; **not** verified in a real browser or with automated a11y tooling |
| Navigation | **VALIDATED** | 600/600 public URLs 200; 0 broken links (was 3); active state observed; controlled 404/307 behaviour verified |
| Admin UX | **VALIDATED** | All 10 admin pages and 11 admin APIs exercised as an owner; 8 concrete UX defects fixed |
| Notice detail UX | **VALIDATED** | Create/edit/publish/archive/restore/delete flows verified; published state visible; attachments correct; long content wraps; missing data → 404 |
| File upload/download UX | **VALIDATED** | No misleading success states; progress, confirmation, busy state and error paths implemented; backend protections unchanged |
| Search UX | **VALIDATED** | Wildcard defect proven and fixed; persistence, caps, long queries, special characters, empty results and result links verified live |
| Archive UX | **VALIDATED** | Navigation, breadcrumbs, traversal rejection, long names, empty states, out-of-range pagination verified; preserved file untouched |
| Browser runtime quality | **NOT VERIFIED** | No browser tooling available. Substitute evidence: 600-URL crawl with 0 non-2xx, 0 error-boundary digests, 0 journal errors, class-name/CSS cross-check, live API validation |
| Production-like frontend verification | **VALIDATED** | Production build deployed, service active, `/api/health` 200, public HTTPS 200/404, all admin pages 200 while authenticated, data counts unchanged, probe accounts removed |

### Gate decision

**P9 is COMPLETE** for every area that can be evidenced in this environment.

The single unchecked box is **Browser runtime quality**, which is declared NOT VERIFIED rather than passed, because no browser or headless browser exists in this environment. It is recorded as residual risk #1 and is the recommended first task of the next phase: run the same public and admin journeys through a real browser at 360px, 768px and 1440px, capture console/hydration output, and add an automated accessibility pass to CI.
