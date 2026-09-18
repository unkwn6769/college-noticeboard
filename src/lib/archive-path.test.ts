import { describe, expect, it } from "vitest";
import { normalizeArchivePath } from "./archive-path";

describe("archive paths", () => {
  it("normalizes a virtual archive path", () => {
    expect(normalizeArchivePath("/Announcements/2024/")).toBe("Announcements/2024");
  });

  it("accepts ordinary archive names including ampersands and spaces", () => {
    expect(normalizeArchivePath("Circulars & Notices/Exam Cell")).toBe("Circulars & Notices/Exam Cell");
  });

  it("rejects traversal segments", () => {
    expect(() => normalizeArchivePath("Announcements/../private")).toThrow("Invalid archive path");
    expect(() => normalizeArchivePath("Announcements/./2024")).toThrow("Invalid archive path");
  });

  it("rejects backslashes and NUL characters", () => {
    expect(() => normalizeArchivePath("Announcements\\private")).toThrow("Invalid archive path");
    expect(() => normalizeArchivePath("Announcements/\u0000/private")).toThrow("Invalid archive path");
  });
});
