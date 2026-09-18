import { describe, expect, it } from "vitest";
import { canPubliclyDownload, getDownloadPermission } from "./file-access";

describe("public file download access", () => {
  it("allows active legacy-import files publicly", () => {
    expect(
      canPubliclyDownload({
        state: "ACTIVE",
        origin_type: "LEGACY_IMPORT",
      }),
    ).toBe(true);
  });

  it("keeps active user uploads private", () => {
    expect(
      canPubliclyDownload({
        state: "ACTIVE",
        origin_type: "USER_UPLOAD",
      }),
    ).toBe(false);
  });

  it("rejects inactive legacy-import files", () => {
    for (const state of ["QUARANTINED", "STAGING", "PURGED"] as const) {
      expect(
        canPubliclyDownload({
          state,
          origin_type: "LEGACY_IMPORT",
        }),
      ).toBe(false);
    }
  });
});

describe("download permission policy", () => {
  it("grants PUBLIC access to active legacy-import files regardless of actor", () => {
    const file = {
      state: "ACTIVE" as const,
      origin_type: "LEGACY_IMPORT" as const,
    };

    expect(getDownloadPermission(file, null)).toBe("PUBLIC");
    expect(getDownloadPermission(file, { role: "USER" })).toBe("PUBLIC");
    expect(getDownloadPermission(file, { role: "ADMIN" })).toBe("PUBLIC");
    expect(getDownloadPermission(file, { role: "OWNER" })).toBe("PUBLIC");
  });

  it("grants ADMIN access to active user uploads only for admins and owners", () => {
    const file = {
      state: "ACTIVE" as const,
      origin_type: "USER_UPLOAD" as const,
    };

    expect(getDownloadPermission(file, null)).toBe("DENIED");
    expect(getDownloadPermission(file, { role: "USER" })).toBe("DENIED");
    expect(getDownloadPermission(file, { role: "ADMIN" })).toBe("ADMIN");
    expect(getDownloadPermission(file, { role: "OWNER" })).toBe("ADMIN");
  });

  it("denies every actor for inactive files", () => {
    for (const state of ["STAGING", "QUARANTINED", "PURGED"] as const) {
      const file = {
        state,
        origin_type: "LEGACY_IMPORT" as const,
      };

      expect(getDownloadPermission(file, null)).toBe("DENIED");
      expect(getDownloadPermission(file, { role: "USER" })).toBe("DENIED");
      expect(getDownloadPermission(file, { role: "ADMIN" })).toBe("DENIED");
      expect(getDownloadPermission(file, { role: "OWNER" })).toBe("DENIED");
    }
  });
});
