import { describe, expect, it } from "vitest";
import { canPubliclyDownload } from "./file-access";

describe("public file download access", () => {
  it("allows active legacy imports", () => {
    expect(canPubliclyDownload({ state: "ACTIVE", origin_type: "LEGACY_IMPORT" })).toBe(true);
  });

  it("keeps active user uploads private", () => {
    expect(canPubliclyDownload({ state: "ACTIVE", origin_type: "USER_UPLOAD" })).toBe(false);
  });

  it("does not allow quarantined legacy objects", () => {
    expect(canPubliclyDownload({ state: "QUARANTINED", origin_type: "LEGACY_IMPORT" })).toBe(false);
  });

  it("does not allow staging or purged objects", () => {
    expect(canPubliclyDownload({ state: "STAGING", origin_type: "LEGACY_IMPORT" })).toBe(false);
    expect(canPubliclyDownload({ state: "PURGED", origin_type: "LEGACY_IMPORT" })).toBe(false);
  });
});
