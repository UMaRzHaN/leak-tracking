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
