import { describe, expect, it, vi } from "vitest";
import { createArchivePhotoProxyReader } from "./archivePhotoProxyReader";

const sizes = { "zip:photos/a.jpg": 512, "zip:photos/empty.jpg": 0 };

describe("createArchivePhotoProxyReader", () => {
  it("answers presence and size without touching the worker", () => {
    const readPhoto = vi.fn();
    const photos = createArchivePhotoProxyReader(sizes, readPhoto);

    expect(photos.has("zip:photos/a.jpg")).toBe(true);
    expect(photos.has("zip:photos/empty.jpg")).toBe(true);
    expect(photos.has("zip:photos/missing.jpg")).toBe(false);
    expect(photos.declaredSize("zip:photos/a.jpg")).toBe(512);
    expect(photos.declaredSize("zip:photos/missing.jpg")).toBe(0);
    expect(readPhoto).not.toHaveBeenCalled();
  });

  it("asks the worker only for entries the archive has", async () => {
    const blob = new Blob(["x"]);
    const readPhoto = vi.fn().mockResolvedValue(blob);
    const photos = createArchivePhotoProxyReader(sizes, readPhoto);

    await expect(photos.read("zip:photos/a.jpg")).resolves.toBe(blob);
    await expect(photos.read("zip:photos/missing.jpg")).resolves.toBeNull();
    expect(readPhoto).toHaveBeenCalledTimes(1);
    expect(readPhoto).toHaveBeenCalledWith("zip:photos/a.jpg");
  });

  it("is not fooled by inherited object properties", () => {
    const photos = createArchivePhotoProxyReader(sizes, vi.fn());

    expect(photos.has("toString")).toBe(false);
    expect(photos.declaredSize("toString")).toBe(0);
  });
});
