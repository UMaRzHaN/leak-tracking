import { describe, expect, it } from "vitest";
import {
  assertArchiveLimits,
  assertImportFileSize,
  IMPORT_LIMITS,
  preflightZipFile,
  verifyArchiveLimits,
} from "./importLimits";

function rangeFile(bytes) {
  return {
    size: bytes.byteLength,
    slice: (start, end) => ({
      arrayBuffer: async () => bytes.slice(start, end),
    }),
    arrayBuffer: async () => bytes,
  };
}

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

  it("counts directory entries toward the archive entry limit", () => {
    const files = Object.fromEntries(
      Array.from(
        { length: IMPORT_LIMITS.maxArchiveEntries + 1 },
        (_, index) => [
          `folder-${index}/`,
          { name: `folder-${index}/`, dir: true },
        ],
      ),
    );

    expect(() => assertArchiveLimits({ files })).toThrow("too many entries");
  });

  it("rejects an entry whose real stream is larger than its forged metadata", async () => {
    let paused = false;
    const handlers = {};
    const stream = {
      on(event, handler) {
        handlers[event] = handler;
        return this;
      },
      pause() {
        paused = true;
      },
      resume() {
        handlers.data({
          byteLength: IMPORT_LIMITS.maxSingleEntryBytes + 1,
        });
      },
    };
    const entry = {
      name: "forged.bin",
      dir: false,
      _data: { uncompressedSize: 1 },
      internalStream: () => stream,
    };

    await expect(
      verifyArchiveLimits({ files: { "forged.bin": entry } }),
    ).rejects.toThrow("too large");
    expect(paused).toBe(true);
  });

  it("counts real streamed bytes across archive entries", async () => {
    const makeEntry = (name, size) => ({
      name,
      dir: false,
      _data: { uncompressedSize: 1 },
      internalStream: () => {
        const handlers = {};
        return {
          on(event, handler) {
            handlers[event] = handler;
            return this;
          },
          pause() {},
          resume() {
            handlers.data({ byteLength: size });
            handlers.end?.();
          },
        };
      },
    });
    const entrySize = IMPORT_LIMITS.maxSingleEntryBytes;
    const entryCount =
      Math.floor(IMPORT_LIMITS.maxUncompressedBytes / entrySize) + 1;
    const files = Object.fromEntries(
      Array.from({ length: entryCount }, (_, index) => {
        const name = `entry-${index}.bin`;
        return [name, makeEntry(name, entrySize)];
      }),
    );

    await expect(verifyArchiveLimits({ files })).rejects.toThrow(
      "safety limit",
    );
  });

  it("rejects an entry-count bomb from the EOCD before ZIP materialization", async () => {
    const bytes = new Uint8Array(22);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, IMPORT_LIMITS.maxArchiveEntries + 1, true);
    view.setUint16(10, IMPORT_LIMITS.maxArchiveEntries + 1, true);

    const file = {
      size: bytes.byteLength,
      // Some test doubles and older Blob shims expose slice without exposing
      // arrayBuffer on the returned slice.
      slice: () => ({}),
      arrayBuffer: async () => bytes,
    };

    await expect(preflightZipFile(file)).rejects.toThrow("too many entries");
  });

  it("counts central-directory headers when the EOCD understates them", async () => {
    const entryCount = IMPORT_LIMITS.maxArchiveEntries + 1;
    const centralSize = entryCount * 46;
    const trailingBytes = 3;
    const bytes = new Uint8Array(centralSize + 22 + trailingBytes);
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset < centralSize; offset += 46) {
      view.setUint32(offset, 0x02014b50, true);
    }
    view.setUint32(centralSize, 0x06054b50, true);
    view.setUint16(centralSize + 8, 1, true);
    view.setUint16(centralSize + 10, 1, true);
    view.setUint32(centralSize + 12, centralSize, true);
    view.setUint32(centralSize + 16, 0, true);

    await expect(preflightZipFile(rangeFile(bytes))).rejects.toThrow(
      "too many entries",
    );
  });

  it("reads ZIP64 counts from a self-extracting archive offset", async () => {
    const prefixBytes = 13;
    const zip64Offset = prefixBytes;
    const locatorOffset = zip64Offset + 56;
    const eocdOffset = locatorOffset + 20;
    const bytes = new Uint8Array(eocdOffset + 22);
    const view = new DataView(bytes.buffer);

    view.setUint32(zip64Offset, 0x06064b50, true);
    view.setBigUint64(zip64Offset + 4, 44n, true);
    view.setBigUint64(
      zip64Offset + 24,
      BigInt(IMPORT_LIMITS.maxArchiveEntries + 1),
      true,
    );
    view.setBigUint64(
      zip64Offset + 32,
      BigInt(IMPORT_LIMITS.maxArchiveEntries + 1),
      true,
    );

    view.setUint32(locatorOffset, 0x07064b50, true);
    view.setBigUint64(locatorOffset + 8, 0n, true);
    view.setUint32(locatorOffset + 16, 1, true);

    view.setUint32(eocdOffset, 0x06054b50, true);
    view.setUint16(eocdOffset + 8, 0xffff, true);
    view.setUint16(eocdOffset + 10, 0xffff, true);
    view.setUint32(eocdOffset + 12, 0xffffffff, true);
    view.setUint32(eocdOffset + 16, 0xffffffff, true);

    await expect(preflightZipFile(rangeFile(bytes))).rejects.toThrow(
      "too many entries",
    );
  });

  it("leaves malformed non-ZIP input to the archive parser", async () => {
    await expect(preflightZipFile(new Blob(["not a zip"]))).resolves.toBeNull();
  });
});
