import { describe, expect, it } from "vitest";

import {
  allocateUniqueLeakArchiveSegments,
  buildLeakPhotoArchivePath,
  buildMonitoringPhotoArchivePath,
  parseDataImageUri,
  sanitizePortableArchiveSegment,
} from "@/services/archive/archivePaths";

describe("archivePaths", () => {
  it("creates portable path segments", () => {
    expect(sanitizePortableArchiveSegment(' TAG<>:"/\\|?*... ')).toBe("TAG-");
    expect(sanitizePortableArchiveSegment("CON.txt")).toBe("_CON.txt");
    expect(sanitizePortableArchiveSegment("..")).toBeNull();
  });

  it("allocates deterministic case-insensitive unique leak folders", () => {
    const segments = allocateUniqueLeakArchiveSegments([
      { id: "internal-a", leak_id: "A/B" },
      { id: "internal-b", leak_id: "A\\B" },
      { id: "internal-c", leak_id: "tag-1" },
      { id: "internal-d", leak_id: "TAG-1" },
      { id: "internal-b", leak_id: "A\\B" },
    ]);

    expect(segments).toEqual([
      "A-B",
      "A-B~internal-b",
      "tag-1",
      "TAG-1~internal-d",
      "A-B~internal-b-2",
    ]);
    expect(new Set(segments.map((segment) => segment.toLowerCase())).size).toBe(
      segments.length,
    );
  });

  it("reserves folders already used by another archive section", () => {
    const mainSegments = allocateUniqueLeakArchiveSegments([
      { id: "main", leak_id: "TAG-1" },
    ]);
    const recoverySegments = allocateUniqueLeakArchiveSegments(
      [{ id: "recovery", leak_id: "tag-1" }],
      { prefix: "recovery", reservedSegments: mainSegments },
    );

    expect(mainSegments).toEqual(["TAG-1"]);
    expect(recoverySegments).toEqual(["tag-1~recovery"]);
  });

  it("builds one path format for leak and monitoring photos", () => {
    expect(buildLeakPhotoArchivePath("TAG-1", "photo", "image/jpeg")).toBe(
      "photos/TAG-1/before.jpg",
    );
    expect(buildMonitoringPhotoArchivePath("TAG-1", 0, "png")).toBe(
      "photos/TAG-1/monitoring/record-1.png",
    );
  });

  it("parses image MIME subtypes with punctuation", () => {
    expect(parseDataImageUri("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({
      mime: "image/svg+xml",
      base64: "PHN2Zz4=",
      ext: "svg",
    });
  });
});
