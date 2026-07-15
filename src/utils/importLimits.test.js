import { describe, expect, it } from "vitest";
import {
  assertArchiveLimits,
  assertImportFileSize,
  IMPORT_LIMITS,
} from "./importLimits";

describe("importLimits", () => {
  it("rejects oversized input files", () => {
    expect(() =>
      assertImportFileSize({ size: IMPORT_LIMITS.maxFileBytes + 1 }),
    ).toThrow("too large");
  });

  it("rejects archives whose expanded content exceeds the limit", () => {
    const zip = {
      files: {
        first: {
          name: "first.bin",
          dir: false,
          _data: { uncompressedSize: IMPORT_LIMITS.maxSingleEntryBytes },
        },
        second: {
          name: "second.bin",
          dir: false,
          _data: { uncompressedSize: IMPORT_LIMITS.maxSingleEntryBytes },
        },
        third: {
          name: "third.bin",
          dir: false,
          _data: { uncompressedSize: IMPORT_LIMITS.maxSingleEntryBytes },
        },
        fourth: {
          name: "fourth.bin",
          dir: false,
          _data: { uncompressedSize: 1 },
        },
      },
    };

    expect(() => assertArchiveLimits(zip)).toThrow("safety limit");
  });
});
