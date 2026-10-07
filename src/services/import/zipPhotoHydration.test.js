import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { hydrateZipPhotos } from "./zipPhotoHydration";

describe("hydrateZipPhotos", () => {
  it("ищет снимки от папки книги, а в старых архивах — от корня", async () => {
    const zip = new JSZip();
    zip.file("Database/photos/LDAR/1/before.jpg", "new");
    zip.file("photos/LDAR/2/before.jpg", "old");
    const loaded = await JSZip.loadAsync(
      await zip.generateAsync({ type: "uint8array" }),
    );

    const result = await hydrateZipPhotos(
      {
        leaks: [
          { leak_id: "1", photo: "zip:photos/LDAR/1/before.jpg" },
          { leak_id: "2", photo: "zip:photos/LDAR/2/before.jpg" },
        ],
        stats: {},
      },
      loaded,
      1,
      "Database/",
    );

    expect(result.leaks[0].photo).toBeInstanceOf(Blob);
    expect(result.leaks[1].photo).toBeInstanceOf(Blob);
    expect(result.stats.missingPhotos).toBe(0);
  });
});
