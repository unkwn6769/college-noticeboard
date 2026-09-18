import { describe, expect, it } from "vitest";
import { getMeaningfulLegacyPath } from "./file-search";

describe("legacy archive search paths", () => {
  it("strips the synthetic department root from an imported path", () => {
    expect(
      getMeaningfulLegacyPath(
        "mech-noticeboard/Announcements/2024/exam-notice.pdf",
        "mech-noticeboard",
      ),
    ).toBe("Announcements/2024/exam-notice.pdf");
  });

  it("does not strip a prefix that does not match the recorded department", () => {
    expect(
      getMeaningfulLegacyPath(
        "mech-noticeboard/Announcements/exam-notice.pdf",
        "cse-noticeboard",
      ),
    ).toBe("mech-noticeboard/Announcements/exam-notice.pdf");
  });

  it("keeps paths unchanged when legacy provenance is incomplete", () => {
    expect(
      getMeaningfulLegacyPath(
        "Announcements/exam-notice.pdf",
        null,
      ),
    ).toBe("Announcements/exam-notice.pdf");
  });

  it("prevents the synthetic root from becoming a search hit", () => {
    const meaningfulPath = getMeaningfulLegacyPath(
      "cse-noticeboard/Announcements/circular.pdf",
      "cse-noticeboard",
    );

    expect(meaningfulPath.toLowerCase()).not.toContain("notice");
    expect(meaningfulPath.toLowerCase()).toContain("announcements");
  });
});
