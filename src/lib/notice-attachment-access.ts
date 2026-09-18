export type NoticeAttachmentAccessInput = {
  noticeStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  fileState: "STAGING" | "ACTIVE" | "QUARANTINED" | "PURGED";
};

export function canPubliclyDownloadNoticeAttachment(
  input: NoticeAttachmentAccessInput,
): boolean {
  return input.noticeStatus === "PUBLISHED" && input.fileState === "ACTIVE";
}
