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
    const entryCount =
      Math.floor(
        IMPORT_LIMITS.maxUncompressedBytes / IMPORT_LIMITS.maxSingleEntryBytes,
      ) + 1;
    const zip = {
      files: Object.fromEntries(
        Array.from({ length: entryCount }, (_, index) => [
          "entry-" + index,
          {
            name: "entry-" + index + ".bin",
            dir: false,
            _data: { uncompressedSize: IMPORT_LIMITS.maxSingleEntryBytes },
          },
        ]),
      ),
    };

    expect(() => assertArchiveLimits(zip)).toThrow("safety limit");
  });
});
