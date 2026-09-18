import { describe, expect, it } from "vitest";
import { matchesPublicSearch, normalizePublicSearchQuery } from "./public-search-match";

describe("public search matching", () => {
  it("normalizes and bounds the query", () => {
    expect(normalizePublicSearchQuery("  computer science  ")).toBe("computer science");
    expect(normalizePublicSearchQuery("a".repeat(150))).toHaveLength(100);
  });

  it("matches any public department field case-insensitively", () => {
    expect(matchesPublicSearch(["CSE", "Computer Science & Engineering"], "science")).toBe(true);
    expect(matchesPublicSearch(["CSE", "Computer Science & Engineering"], "MECH")).toBe(false);
  });

  it("does not match a department only because its slug contains the synthetic noticeboard suffix", () => {
    expect(
      matchesPublicSearch(
        ["CSE", "Computer Science & Engineering", "Software, computing, and engineering resources."],
        "notice",
      ),
    ).toBe(false);
  });

  it("does not treat an empty query as a match", () => {
    expect(matchesPublicSearch(["CSE", "Computer Science & Engineering"], "")).toBe(false);
  });
});
