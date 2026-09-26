# P10 Closeout Record

**Date:** 2026-09-26
**Covers:** the gaps left open by the P10–P19 implementation report
**Baseline:** P9 MAX, `1e3569641bfa49eb1259483d22a1e7dc24457224`

Evidence labels are the project labels: IMPLEMENTED, TESTED, OBSERVED, VALIDATED,
NOT VERIFIED. Nothing below is claimed without a command that produced it.

---

## 1. Automated accessibility — the gap that was open

### VALIDATED

axe-core was installed and run against the real application. Nothing was suppressed; axe
ran with its default rule set and every violation was reported verbatim.

| | Before | After |
|---|---|---|
| Page states scanned | 98 | 98 |
| Violations | **5** | **0** |
| serious + critical | **1** | **0** |

Scanned: 22 routes × 4 widths (320 / 360 / 768 / 1280) = 88 route loads, plus 10 modal
states — the public navigation drawer and the command palette in their **open** state, which
is where accessibility problems usually hide.

### The two real defects found, and the fixes

**1. `definition-list` (serious, 4 findings — one per viewport).**
The scanner page renders its metric tiles as `<dl className="metric-grid">`, but the `Metric`
component emitted `<span>` elements inside it. A `<span>` is not permitted inside a `dl > div`,
so the label/value pairing was never exposed as a description list. The rest of the product
already pairs `<dt>`/`<dd>` inside every other `dl` (`reading-byline`, `data-list-meta`,
`summary-list`, `definition-grid`); the scanner was the only outlier. Fixed by emitting
`<dt className="metric-label">` and `<dd className="metric-value">`, matching the house style,
rather than by downgrading the `<dl>` to a `<div>` and losing the semantics.

A `<dd>` carries a 40px user-agent indent, so `.metric-value` gained the same `margin: 0` reset
that every other `dd` in the stylesheet already has. Measured afterwards at all four widths:
label and value both start at 17px inside a 246/286/218/221px tile, no overflow, correct values.

**2. Command palette was never scanned (critical, a harness defect, not an app defect).**
The scanner opened the palette by clicking the top-bar entry point, which is not rendered at
360px, so the state timed out. Replaced with the documented `Ctrl+K` shortcut a keyboard user
would actually press. The palette now scans cleanly at both widths.

### False positives identified and corrected

- The desktop width at which the mobile drawer toggles are **legitimately hidden** (a
  persistent sidebar / horizontal nav is shown instead). Recorded as "not applicable at this
  width" rather than forced open. Two such notes, both expected.
- `axe` reported nothing else. No `aria-*` was added to silence a rule anywhere in this phase.

### Browser regression after the fix

The existing assertion suite still passes in full: **149/149, 0 failures.** The
`dt`/`dd` change altered no geometry, confirmed by direct tile measurement.

---

## 2. End-to-end mutation verification — the gap that was open

### VALIDATED

**50/50 checks, 0 failures**, run against the live production service through the real HTTP
API, using only synthetic records created by the harness.

Lifecycle exercised, in order, with the state transition confirmed at each step:

1. create notice → `DRAFT`
2. upload file → `ACTIVE`, row size + SHA-256 match, object on disk byte-exact (546 B)
3. attach file to notice → 1 attachment row
4. publish notice → `PUBLISHED`
5. published notice publicly visible to an anonymous visitor → 200
6. **anonymous attachment download byte-identical to what was uploaded** → 200
7. replace file → **new** storage key, `ACTIVE`, v2 object on disk byte-exact (1310 B)
8. two `file_versions` rows
9. **invariant held: the v1 object was not overwritten in place** — still present under its own
   key, still hashing to v1's digest (`AGENTS.md`: *active objects are never overwritten in place*)
10. quarantine → `QUARANTINED`, `cleanupStatus: "pending"`, PENDING `cleanup_operations` row,
    object still intact under `files/`
11. quarantine is not repeatable → 409
12. **maintenance run** (the documented command, as the storage owner) → exit 0, object moved to
    `quarantine/objects/`, **byte-exact**, cleanup row `COMPLETED`
13. recycle bin lists the quarantined file
14. restore → `ACTIVE`, object back under `files/` byte-exact, no longer in quarantine
15. restore is not repeatable → 409
16. purge → `PURGED`, **no object and no quarantined object on disk**; the v1 object is gone too
17. purge is not repeatable → 409
18. archive notice → `ARCHIVED`, and it leaves the public board (404)
19. delete notice (soft) → `deleted_at` set, listed in the recycle bin
20. restore notice → `deleted_at` cleared
21. permanently delete notice → row gone; not repeatable → 404

**Unauthorized path, for every mutation:** a signed-in `USER` was refused with **401** on all
ten: create notice, upload, publish, archive, delete notice, quarantine, replace, restore file,
purge file, read the recycle bin. Side effects were asserted to be zero — the notice count and
file count were re-read and unchanged. A cross-origin `OWNER` POST was refused with 400 and
created nothing.

### A real design property this gap uncovered

Deletion is **two-phase by design**, which the source had not made obvious and the earlier
report had not tested: the API records the logical quarantine and returns
`cleanupStatus: "pending"`; the physical move is performed by `maintenance`. Restoring before
maintenance has run correctly fails with 409. The harness initially asserted the move was
synchronous and was wrong. The assertions now check the documented intermediate state, and the
maintenance phase is part of the verified sequence. This is the behaviour `AGENTS.md` describes
as *"deletion quarantines before purge"*, now demonstrated rather than assumed.

### Cleanup — production left exactly as found

Purge deliberately **retains the file row** in `PURGED` state; only the bytes are destroyed.
That is correct, so the harness assertion was corrected rather than the behaviour. The
harness's own leftover rows were then removed in a single scoped transaction
(`original_name LIKE 'SYNTHETIC-CLOSEout-%'`, a prefix no production record can match), which
had to clear `files.current_version_id` first — the foreign key correctly refused the naive
order and the transaction rolled back before being corrected.

Final state, identical to the pre-verification baseline:

| | value | expected |
|---|---|---|
| files | 47911 | 47911 |
| file_versions | 47915 | 47915 |
| cleanup_operations | 19 | 19 |
| notices / published | 2 / 2 | 2 / 2 |
| users | 4 | 4 (pre-existing) |
| orphaned ACTIVE rows | 0 | 0 |
| synthetic residue | 0 | 0 |
| legacy scanner items / runs | 907 / 12 | unchanged |

---

## 3. File-corpus disaster recovery

### IMPLEMENTED and VALIDATED — full-corpus integrity verification

New maintained command `scripts/verify-corpus.mjs` (`npm run verify:corpus`). Read-only: it
opens each object for reading and never writes, moves or deletes. Because the database stores
each object's size and SHA-256, the corpus is self-describing, and this command proves the
stored bytes are what the database believes they are.

**Full corpus, every ACTIVE object:**

```
activeRows      47900
checked         47900
verified        47900
verifiedBytes   28200896231   (28.2 GB)
missing         0
sizeMismatch    0
hashMismatch    0
unreadable      0
consistent      true
exit 0          (3m31s, strict mode)
```

This is the precondition for pairing a database restore with the existing corpus, and it is now
a repeatable command rather than a one-off sample.

### VALIDATED — application-level restore rehearsal

The earlier scratch restore proved the dump was readable. That is not the same as proving the
restored database is *usable by the application*, so the rehearsal was taken further:

1. created a separate scratch database, restored the 03:15 dump into it — exit 0, **10 tables,
   47 911 file rows, 2 notices**
2. started a **second instance of the built application** against the restored database on a
   spare port, composing the connection string in memory so no credential was printed, passed
   on a command line, or written to disk
3. exercised the application against restored state:

| route | result |
|---|---|
| `/` | 200 |
| `/departments` | 200 |
| `/archive` | 200 |
| `/archive/it-noticeboard` | 200 |
| `/archive/it-noticeboard/OLD%20DATA` | 200 |
| `/search?q=notice` | 200 |
| `/login` | 200 |
| `/api/health` | 200 — `{"ok":true,"postgresql":"ok","storageRoot":"ok",…}` |
| `/no-such-page` | 404 |

4. **proved database↔file consistency through the restored instance:** a 100 023-byte PDF
   downloaded from the rehearsal instance was byte-identical to the size *and* SHA-256 recorded
   in the **restored** database row
5. stopped the instance, dropped the scratch database (0 remaining), confirmed production
   `active`, `:3000 → 200`, health `ok`

One finding worth recording: `pg_restore --no-owner` leaves the restored tables owned by
`postgres`, so the application role needs `USAGE` on the schema and DML on the tables before it
can read the restored data. Without that the instance returns 500 with a PostgreSQL
`aclcheck_error`. This is now part of the documented procedure.

### NOT IMPLEMENTED — independent off-host copy of the file corpus

Measured, not assumed:

| volume | size | free | holds |
|---|---|---|---|
| `/dev/sdc` (mounted at `/srv/noticeboard`) | 63 G | 33 G | the 27 GB corpus, backups, quarantine |
| `/dev/root` (the OS and `/opt/college-noticeboard`) | 30 G | 7.6 G | application, `.next` |

A duplicate corpus does not fit in the 7.6 GB free on the OS volume, and placing it on the same
volume that already holds the live corpus would not be an independent backup — it would consume
the headroom the live volume needs and protect against nothing that matters. So no second copy
was created. **This remains the project's single largest recovery exposure**, unchanged from
what the README already stated, and now stated with measurements.

A full environment restore performed directly on production was **not** attempted: it is not
safe to do on the live database. The isolated rehearsal above is the safe equivalent.

---

## 4. Historical journal errors — investigated, not reproduced

Investigated through the PostgreSQL server log (`/var/log/postgresql/`), which is read-only and
carries more detail than the application journal.

### Database authentication failures — mechanism OBSERVED, cause NOT VERIFIED

The earlier report said "30 occurrences, 15:06–17:01". The server log shows the real picture:
roughly **200 failures spread across 09:56–17:01 on 2026-09-25**, in bursts of 5, 10, 15, 20 and
33 — a development session retrying a connection pool, not a production incident. The last
failure is at `17:01:21`, matched against `pg_hba.conf` line 125, `scram-sha-256`.

What is established: SCRAM authentication was being rejected for `college_noticeboard_app`
over a bounded ~7-hour window on 2026-09-25 that coincides with the P7/P8 development work
(`P7_FINAL_REPORT.md` 20:29, `P8_AUDIT.md` 18:37 that day). The application journal's 30 lines
were a heavily sampled subset.

What is not established, and cannot be without inspecting credential history:

> **NOT VERIFIED — credential-preserving constraint**

No credential was read, altered or tested. The role authenticates correctly now (every
verification in this closeout used it successfully), and `/api/health` reports
`postgresql: ok`. `pg_hba.conf` is unchanged and correct.

### `could not determine data type of parameter $N` (PostgreSQL 42P18) — RESOLVED

**8 occurrences total, all on 2026-09-25**, and none since:

- `13:39:43` — one, from `p7_runner_20260925@college_noticeboard`, a one-off P7 test role
- `20:05:39 – 20:06:55` — seven, from `college_noticeboard_app` during the scanner work

The last was **2026-09-25 20:06:55**, over 21 hours before this phase began. Zero occurrences
since, across: 96 route loads at four viewports, 98 axe scans, 149 browser assertions, 75
security probes, 50 mutation operations and a full 28 GB corpus verification. The test suite
contains the specific regression test added for this exact class — *"every bound parameter is
referenced by the statement it is sent with"* — in `src/lib/files-list-query.test.ts` and
`src/lib/notices-query.test.ts`.

One 42P18-adjacent entry in the current server log is **from this closeout's own first cleanup
attempt**: a foreign-key violation that the database correctly raised, inside a transaction that
rolled back. It is the constraint working as designed, not a fault.

### Current state

Zero application-journal error lines, and zero application-role database errors, since the
P10 deployment.

---

## 5. Screen reader and physical device

### NOT VERIFIED — no screen-reader runtime available

Checked and absent on this host: `orca`, `espeak`, `espeak-ng`, `festival`, `spd-say`,
`srgsim`, `accerciser`, and the whole at-spi2 accessibility stack (no packages, no bus
running). Terminal and DOM inspection is **not** a screen-reader run and is not presented as one.

### NOT VERIFIED — no physical device available

`systemd-detect-virt` reports `microsoft`; hardware model is *Virtual Machine*. No `adb`, no
`libimobiledevice`, no USB bus. Viewport widths were emulated.

### What was done instead, and what it does and does not prove

The Chromium **computed accessibility tree** was read through CDP
(`Accessibility.getFullAXTree`) for six surfaces. This is the layer assistive technology
consumes, so it closes the gap between "the attribute is in the DOM" and "the platform exposes
it". It is **not** a substitute for a screen reader.

| surface | AX nodes | landmarks | h1 | unnamed image/button/link |
|---|---|---|---|---|
| home | 906 | banner 1, main 1, contentinfo 1, navigation 3, search 1 | 1 | 0 / 0 / 0 |
| archive-deep | 1676 | banner 1, main 1, contentinfo 1, navigation 5 | 1 | 0 / 0 / 0 |
| notice | 192 | banner 1, main 1, contentinfo 1, navigation 4 | 1 | 0 / 0 / 0 |
| login | 45 | form 1, main 1 | 1 | 0 / 0 / 0 |
| scanner | 641 | banner 1, main 1, navigation 1 | 1 | 0 / 0 / 0 |
| drawer (open) | 406 | dialog 1 (named **"Main menu"**), navigation 2 | 0 † | 0 / 0 / 0 |

† With the modal open the background is correctly hidden from the accessibility tree, so the
page `h1` and `main` are absent — that is the correct modal behaviour, not a missing heading.

Two results worth calling out:

- **The `dt`/`dd` fix is confirmed at the accessibility layer:** the scanner page exposes
  `term: 6, definition: 6` and the notice byline `term: 2, definition: 2`. Before the fix these
  would have been plain static text.
- **`aria-current` could not be confirmed in the accessibility tree.** The complete set of AX
  property names returned on a page that definitely has `aria-current="page"` is
  `atomic, focusable, focused, invalid, labelledby, level, live, pressed, relevant, url` — this
  Chromium's CDP `getFullAXTree` does not report `current` at all. So its absence in the tree is
  a **measurement limitation of this tooling**, not evidence that it is missing. The attribute
  itself is verified present and correct by 20 dedicated browser assertions.

---

## 6. P20 / P21

> **NOT IN CURRENT REQUIRED SCOPE**

Searched every Markdown file in the repository (outside `node_modules`): there is no
authoritative definition of a phase P20 or P21, no reference to one, and no roadmap entry
making one due. The project documentation runs P1 → P9 (in `P7_FINAL_REPORT.md`,
`P8_AUDIT.md`, `P9_UI_AUDIT.md`) plus the P10 record. No portfolio, certification or
accreditation result is defined or claimed.

---

## 7. Data integrity after closeout

Identical to the pre-verification baseline, confirmed after every phase:

```
files                  47911   (P9 baseline 47911)
file_versions          47915
notices                   2
published notices         2
users                     4   (all pre-existing)
orphaned ACTIVE rows      0
synthetic residue         0
legacy scanner items    907
legacy scanner runs      12
```

No OmniRoute process was touched (6 still running). The legacy IIS application was not
modified; it answered 200 when checked read-only.
