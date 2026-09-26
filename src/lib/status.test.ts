import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scannerRunOutcome, scannerRunStatus } from "./status";
import { isPublicNavActive, PUBLIC_NAV } from "./public-nav";

/**
 * `legacy_scanner_runs.status` is constrained by a CHECK constraint in the
 * schema, so the UI vocabulary has to be derived from that constraint rather
 * than from the values someone expected the scanner to write. Reading the
 * constraint here means a future migration that adds a status fails this test
 * instead of quietly rendering an unmapped neutral badge.
 *
 * The path is resolved from this module rather than from `process.cwd()`, so
 * the test does not depend on the working directory the runner happens to use.
 */
function persistedRunStatuses(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schema = readFileSync(path.join(here, "..", "..", "db", "006_legacy_scanner.sql"), "utf8");
  const match = schema.match(
    /status TEXT NOT NULL CHECK \(status IN \(([^)]*)\)\)/,
  );
  if (!match) throw new Error("legacy_scanner_runs.status CHECK constraint not found");
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((entry) => entry[1]);
}

describe("scanner run status vocabulary", () => {
  it("maps every status the schema permits, and nothing it does not", () => {
    const persisted = persistedRunStatuses();
    expect(persisted).toEqual(["RUNNING", "SUCCEEDED", "FAILED", "INTERRUPTED"]);
    for (const status of persisted) {
      const descriptor = scannerRunStatus(status);
      expect(descriptor.label).not.toBe("Unknown");
      // A value with no explicit entry falls back to a neutral humanised
      // label, which is how the finished run previously lost its success tone.
      expect(descriptor.tone).not.toBe("neutral");
    }
  });

  it("does not map statuses the schema forbids", () => {
    for (const impossible of ["COMPLETED", "PENDING", "CANCELLED"]) {
      expect(persistedRunStatuses()).not.toContain(impossible);
    }
  });

  it("reports a completed run with failed items as a partial failure", () => {
    const clean = scannerRunOutcome({ status: "SUCCEEDED", failed_count: 0 });
    expect(clean.tone).toBe("success");
    expect(clean.label).toBe("Succeeded");

    const partial = scannerRunOutcome({ status: "SUCCEEDED", failed_count: 3 });
    expect(partial.tone).toBe("warning");
    expect(partial.label).toBe("Succeeded with 3 failed items");

    const single = scannerRunOutcome({ status: "SUCCEEDED", failed_count: 1 });
    expect(single.label).toBe("Succeeded with 1 failed item");
  });

  it("does not relabel a run that did not succeed", () => {
    expect(scannerRunOutcome({ status: "FAILED", failed_count: 9 }).tone).toBe("danger");
    expect(scannerRunOutcome({ status: "RUNNING", failed_count: 9 }).label).toBe("Running");
    expect(scannerRunOutcome({ status: "INTERRUPTED", failed_count: 9 }).tone).toBe("warning");
  });
});

describe("public navigation active state", () => {
  it("never marks two items in the same nav as the current page", () => {
    for (const pathname of ["/", "/departments", "/departments/cse-noticeboard", "/archive", "/search", "/archive/it-noticeboard/OLD%20DATA"]) {
      const current = PUBLIC_NAV.filter((item) => isPublicNavActive(pathname, item));
      expect(current.length).toBeLessThanOrEqual(1);
    }
  });

  it("does not treat a fragment shortcut as a page", () => {
    const notices = PUBLIC_NAV.find((item) => item.fragmentOnly);
    expect(notices).toBeDefined();
    expect(isPublicNavActive("/", notices!)).toBe(false);
  });

  it("keeps the home item current only on the home route", () => {
    const home = PUBLIC_NAV.find((item) => item.href === "/")!;
    expect(isPublicNavActive("/", home)).toBe(true);
    expect(isPublicNavActive("/departments", home)).toBe(false);
  });

  it("keeps a section current for its own route and everything nested below it", () => {
    const departments = PUBLIC_NAV.find((item) => item.href === "/departments")!;
    const archive = PUBLIC_NAV.find((item) => item.href === "/archive")!;
    expect(isPublicNavActive("/departments", departments)).toBe(true);
    expect(isPublicNavActive("/departments/cse-noticeboard", departments)).toBe(true);
    expect(isPublicNavActive("/departments/cse-noticeboard/file/abc", departments)).toBe(true);
    expect(isPublicNavActive("/archive", archive)).toBe(true);
    expect(isPublicNavActive("/archive/it-noticeboard/OLD%20DATA", archive)).toBe(true);
    expect(isPublicNavActive("/search", archive)).toBe(false);
  });
});
