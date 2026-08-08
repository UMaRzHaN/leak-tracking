import { describe, expect, it } from "vitest";
import {
  createArchivePhotoReader,
  isArchivePhotoPath,
} from "./archivePhotoReader";

async function zipWith(files) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const blob = await zip.generateAsync({ type: "blob" });
  return JSZip.loadAsync(blob);
}

describe("isArchivePhotoPath", () => {
  it("accepts only zip: references", () => {
    expect(isArchivePhotoPath("zip:photos/a.jpg")).toBe(true);
    expect(isArchivePhotoPath("data:image/png;base64,AA")).toBe(false);
    expect(isArchivePhotoPath("idb://a")).toBe(false);
    expect(isArchivePhotoPath(undefined)).toBe(false);
  });
});

describe("createArchivePhotoReader", () => {
  it("reads a photo and types it from the extension", async () => {
    const zip = await zipWith({ "photos/a.png": "binary-ish" });
    const photos = createArchivePhotoReader(zip);

    const blob = await photos.read("zip:photos/a.png");

    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("binary-ish");
  });

  it("reports presence without decompressing", async () => {
    const zip = await zipWith({ "photos/a.jpg": "x" });
    const photos = createArchivePhotoReader(zip);

    expect(photos.has("zip:photos/a.jpg")).toBe(true);
    expect(photos.has("zip:photos/missing.jpg")).toBe(false);
    expect(photos.has("data:image/png;base64,AA")).toBe(false);
  });

  it("returns null for an absent or non-archive path", async () => {
    const zip = await zipWith({ "photos/a.jpg": "x" });
    const photos = createArchivePhotoReader(zip);

    await expect(photos.read("zip:photos/missing.jpg")).resolves.toBeNull();
    await expect(photos.read("idb://elsewhere")).resolves.toBeNull();
  });

  it("exposes the declared size and zero when unknown", async () => {
    const zip = await zipWith({ "photos/a.jpg": "12345" });
    const photos = createArchivePhotoReader(zip);

    expect(photos.declaredSize("zip:photos/a.jpg")).toBe(5);
    expect(photos.declaredSize("zip:photos/missing.jpg")).toBe(0);
    expect(photos.declaredSize("data:image/png;base64,AA")).toBe(0);
  });
});
