import { describe, expect, it } from "vitest";
import { normalizeNoticeMetadata } from "./notice-metadata";

describe("notice metadata", () => {
  it("normalizes a known department and category", () => {
    expect(
      normalizeNoticeMetadata({
        department: "cse-noticeboard",
        category: "Academic",
        isPinned: true,
      }),
    ).toEqual({
      department: "cse-noticeboard",
      category: "Academic",
      isPinned: true,
    });
  });

  it("rejects unknown departments", () => {
    expect(() => normalizeNoticeMetadata({ department: "unknown-noticeboard" }))
      .toThrow("INVALID_DEPARTMENT");
  });

  it("converts empty optional fields to null and false", () => {
    expect(normalizeNoticeMetadata({ department: " ", category: " " }))
      .toEqual({ department: null, category: null, isPinned: false });
  });

  it("bounds long categories", () => {
    expect(normalizeNoticeMetadata({ category: "a".repeat(100) }).category).toHaveLength(64);
  });
});
