import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ZipStoreStreamWriter } from "./zipStoreStream";

function concatenate(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function openChunks(chunks) {
  return JSZip.loadAsync(concatenate(chunks));
}

/**
 * Byte-exact comparison that names the first mismatch.
 *
 * expect().toEqual() on a 600 KB Uint8Array runs its structural diff over
 * every element and takes ~2.6 s of the 5 s test budget on an idle machine,
 * which is what made this file fail under a loaded CI runner. This loop does
 * the same check in about a millisecond and reports a more useful failure.
 */
function firstDifference(actual, expected) {
  if (actual.length !== expected.length) {
    return `length ${actual.length}, expected ${expected.length}`;
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return `byte ${index} is ${actual[index]}, expected ${expected[index]}`;
    }
  }
  return null;
}

describe("ZipStoreStreamWriter", () => {
  it("writes a standards-compatible archive without collecting output", async () => {
    const chunks = [];
    const writer = new ZipStoreStreamWriter(async (chunk) => {
      chunks.push(chunk.slice());
    });

    await writer.add("данные/report.json", '{"ok":true}');
    await writer.add("photos/a.jpg", new Blob([new Uint8Array(700_000)]));
    const total = await writer.close();

    expect(chunks.length).toBeGreaterThan(3);
    expect(
      Math.max(...chunks.map((chunk) => chunk.length)),
    ).toBeLessThanOrEqual(256 * 1024);
    expect(chunks.reduce((sum, chunk) => sum + chunk.length, 0)).toBe(total);

    const zip = await openChunks(chunks);
    expect(await zip.file("данные/report.json").async("string")).toBe(
      '{"ok":true}',
    );
    expect(await zip.file("photos/a.jpg").async("uint8array")).toHaveLength(
      700_000,
    );
  });

  // The other tests read entries back with CRC checking off, so a wrong
  // checksum would still round-trip through them. This verifies our CRC32
  // against JSZip's independent implementation instead.
  it("writes checksums that validate against an independent CRC32", async () => {
    const chunks = [];
    const writer = new ZipStoreStreamWriter(async (chunk) => {
      chunks.push(chunk.slice());
    });

    await writer.add("ascii.txt", "123456789");
    await writer.add("unicode.txt", "данные — ok");
    // Larger than BLOB_CHUNK_BYTES, so the checksum spans several chunks.
    const photo = new Uint8Array(600_000);
    for (let index = 0; index < photo.length; index += 1) {
      photo[index] = (index * 31) & 0xff;
    }
    await writer.add("photo.jpg", new Blob([photo]));
    await writer.close();

    const zip = await JSZip.loadAsync(concatenate(chunks), {
      checkCRC32: true,
    });
    expect(await zip.file("ascii.txt").async("string")).toBe("123456789");
    expect(await zip.file("unicode.txt").async("string")).toBe("данные — ok");
    expect(
      firstDifference(await zip.file("photo.jpg").async("uint8array"), photo),
    ).toBeNull();
  });

  it("rejects traversal and duplicate entry names", async () => {
    const writer = new ZipStoreStreamWriter(async () => {});

    await expect(writer.add("../secret", "x")).rejects.toThrow("Invalid");
    await writer.add("safe.txt", "x");
    await expect(writer.add("safe.txt", "y")).rejects.toThrow("Duplicate");
  });

  it("stops before emitting bytes beyond a configured portable limit", async () => {
    const chunks = [];
    const writer = new ZipStoreStreamWriter(
      async (chunk) => {
        chunks.push(chunk);
      },
      { maxBytes: 64 },
    );

    await expect(writer.add("data.bin", new Uint8Array(64))).rejects.toThrow(
      "Export archive is larger",
    );
    expect(
      chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    ).toBeLessThanOrEqual(64);
  });
});
