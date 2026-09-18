import { describe, expect, it } from "vitest";

import { canPubliclyDownloadNoticeAttachment } from "./notice-attachment-access";

describe("notice attachment public access", () => {
  it("allows active attachments on published notices", () => {
    expect(
      canPubliclyDownloadNoticeAttachment({
        noticeStatus: "PUBLISHED",
        fileState: "ACTIVE",
      }),
    ).toBe(true);
  });

  it("denies attachments on drafts", () => {
    expect(
      canPubliclyDownloadNoticeAttachment({
        noticeStatus: "DRAFT",
        fileState: "ACTIVE",
      }),
    ).toBe(false);
  });

  it("denies attachments on archived notices", () => {
    expect(
      canPubliclyDownloadNoticeAttachment({
        noticeStatus: "ARCHIVED",
        fileState: "ACTIVE",
      }),
    ).toBe(false);
  });

  it("denies inactive files even when the notice is published", () => {
    for (const fileState of ["STAGING", "QUARANTINED", "PURGED"] as const) {
      expect(
        canPubliclyDownloadNoticeAttachment({
          noticeStatus: "PUBLISHED",
          fileState,
        }),
      ).toBe(false);
    }
  });
});
