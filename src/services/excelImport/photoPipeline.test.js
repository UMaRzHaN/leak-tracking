import { describe, expect, it, vi } from "vitest";
import { hydrateZipPhotos } from "./photoPipeline";

describe("hydrateZipPhotos", () => {
  it("materializes a shared ZIP entry only once", async () => {
    const asyncRead = vi.fn().mockResolvedValue(new Blob(["photo"]));
    const zip = { file: vi.fn(() => ({ async: asyncRead })) };
    const result = await hydrateZipPhotos(
      {
        leaks: [
          {
            id: "one",
            photo: "zip:photos/shared.jpg",
            monitoringRecords: [
              {
                photo: "zip:photos/shared.jpg",
                previousPhoto: "zip:photos/shared.jpg",
              },
            ],
          },
          { id: "two", photo_after: "zip:photos/shared.jpg" },
        ],
        stats: {},
      },
      zip,
    );

    expect(asyncRead).toHaveBeenCalledOnce();
    expect(zip.file).toHaveBeenCalledOnce();
    expect(result.stats).toMatchObject({
      restoredPhotos: 4,
      photoReferences: 4,
      uniquePhotoEntriesRead: 1,
    });
    expect(result.leaks[0].photo).toBe(result.leaks[1].photo_after);
    expect(result.leaks[0].monitoringRecords[0].previousPhoto).toBe(
      result.leaks[0].photo,
    );
  });
});
