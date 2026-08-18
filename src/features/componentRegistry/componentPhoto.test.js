import { describe, expect, it, vi } from "vitest";
import {
  extractPhotoBlob,
  isStoredPhotoPath,
  withStoredPhoto,
} from "@/features/componentRegistry/componentPhoto";

describe("telling a picked photo from a stored one", () => {
  it("recognises a stored path", () => {
    expect(isStoredPhotoPath("idb://abc")).toBe(true);
    expect(isStoredPhotoPath("")).toBe(false);
    expect(isStoredPhotoPath({ raw: "blob", src: "data:" })).toBe(false);
    expect(isStoredPhotoPath(null)).toBe(false);
  });

  it("takes the blob out of what the input holds", () => {
    const raw = new Blob(["x"]);
    expect(extractPhotoBlob({ raw, src: "data:image/png;base64,AA" })).toBe(
      raw,
    );
    expect(extractPhotoBlob(null)).toBeNull();
    expect(extractPhotoBlob("idb://abc")).toBeNull();
  });
});

describe("storing a card's photo", () => {
  it("replaces the picked object with the path it was written to", async () => {
    // Writing the object straight onto the card left the photo unsaved and
    // every reader calling startsWith on an object.
    const savePhoto = vi.fn(async () => "idb://stored");

    const card = await withStoredPhoto(
      { id: "a", photo: { raw: new Blob(["x"]), src: "data:" } },
      "a",
      savePhoto,
    );

    expect(card.photo).toBe("idb://stored");
    expect(typeof card.photo).toBe("string");
    expect(savePhoto).toHaveBeenCalledTimes(1);
  });

  it("leaves an untouched photo where it already is", async () => {
    // Re-saving the same image under a new key would orphan the old one.
    const savePhoto = vi.fn();

    const card = await withStoredPhoto(
      { id: "a", photo: "idb://existing" },
      "a",
      savePhoto,
    );

    expect(card.photo).toBe("idb://existing");
    expect(savePhoto).not.toHaveBeenCalled();
  });

  it("leaves the key off a card with no photo at all", async () => {
    const card = await withStoredPhoto({ id: "a" }, "a", vi.fn());
    expect("photo" in card).toBe(false);
  });

  it("drops an empty pick rather than storing a husk", async () => {
    const card = await withStoredPhoto({ id: "a", photo: {} }, "a", vi.fn());
    expect("photo" in card).toBe(false);
  });

  it("refuses to claim a photo storage would not take", async () => {
    // A card pointing at a path that was never written shows a broken image
    // where the evidence should be.
    await expect(
      withStoredPhoto(
        { id: "a", photo: { raw: new Blob(["x"]) } },
        "a",
        async () => null,
      ),
    ).rejects.toMatchObject({ code: "COMPONENT_PHOTO_SAVE_FAILED" });
  });
});
