import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  prepare: vi.fn(),
  appendChunk: vi.fn(),
  commit: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => plugin),
}));

const { writePublicFile } = await import("./publicFileWriter");

describe("publicFileWriter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plugin.prepare.mockResolvedValue({
      token: "export-token",
      maxExportBytes: 2 * 1024 * 1024,
    });
    plugin.appendChunk.mockResolvedValue({});
    plugin.commit.mockResolvedValue({ path: "Documents/export/report.zip" });
    plugin.discard.mockResolvedValue({});
  });

  it("streams a large blob through bounded bridge chunks", async () => {
    const blob = new Blob([new Uint8Array(600 * 1024)], {
      type: "application/zip",
    });

    await expect(
      writePublicFile({
        folder: "export",
        fileName: "report.zip",
        blob,
      }),
    ).resolves.toEqual({ path: "Documents/export/report.zip" });

    expect(plugin.appendChunk).toHaveBeenCalledTimes(2);
    for (const [{ token, chunkBase64 }] of plugin.appendChunk.mock.calls) {
      expect(token).toBe("export-token");
      expect(chunkBase64.length).toBeLessThan(700_000);
    }
    expect(plugin.commit).toHaveBeenCalledWith({
      token: "export-token",
      expectedSize: 600 * 1024,
      folder: "export",
      fileName: "report.zip",
      mimeType: "application/zip",
    });
    expect(plugin.discard).not.toHaveBeenCalled();
  });

  it("discards the temporary file when the export exceeds the native limit", async () => {
    plugin.prepare.mockResolvedValue({
      token: "small-limit",
      maxExportBytes: 3,
    });

    await expect(
      writePublicFile({
        folder: "",
        fileName: "large.zip",
        blob: new Blob(["large"]),
      }),
    ).rejects.toThrow("larger than");

    expect(plugin.appendChunk).not.toHaveBeenCalled();
    expect(plugin.commit).not.toHaveBeenCalled();
    expect(plugin.discard).toHaveBeenCalledWith({ token: "small-limit" });
  });

  it("discards partial output when a chunk write fails", async () => {
    plugin.appendChunk.mockRejectedValue(new Error("disk full"));

    await expect(
      writePublicFile({
        folder: "",
        fileName: "report.zip",
        blob: new Blob(["content"]),
      }),
    ).rejects.toThrow("disk full");

    expect(plugin.commit).not.toHaveBeenCalled();
    expect(plugin.discard).toHaveBeenCalledWith({ token: "export-token" });
  });
});
