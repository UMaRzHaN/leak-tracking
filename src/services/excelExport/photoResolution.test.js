import { describe, expect, it, vi } from "vitest";

// Так отвечает телефон: `getPhotoSrc` понимает только пути хранилища.
const photoService = vi.hoisted(() => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/hooks/photoService", () => photoService);

import { resolvePhotoCandidates } from "./photoResolution";

const candidate = (path, mapKey) => ({
  path,
  mapKey,
  logicalKey: mapKey,
  buildArchivePath: (extension) => `photos/${mapKey}.${extension}`,
});

describe("resolvePhotoCandidates", () => {
  it("takes a data URI photo as is instead of asking device storage", async () => {
    const entries = await resolvePhotoCandidates(
      [candidate("data:image/jpeg;base64,cm91bmQ=", "round")],
      null,
      new Map(),
    );

    expect(entries).toEqual([
      expect.objectContaining({
        mapKey: "round",
        photoFileName: "photos/round.jpg",
        base64: "cm91bmQ=",
      }),
    ]);
    expect(photoService.getPhotoSrc).not.toHaveBeenCalled();
  });

  it("skips a value that is not a path instead of failing the whole workbook", async () => {
    const entries = await resolvePhotoCandidates(
      [
        candidate(new Blob(["round"], { type: "image/jpeg" }), "blob"),
        candidate({}, "empty"),
      ],
      null,
      new Map(),
    );

    expect(entries).toEqual([]);
  });
});
