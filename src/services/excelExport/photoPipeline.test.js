import { describe, expect, it, vi } from "vitest";
import {
  buildLeakPhotoEntries,
  buildMonitoringPhotoEntries,
  buildPhotoMap,
  buildPortableLeaks,
} from "./photoPipeline";

const PNG_DATA_URI = "data:image/png;base64,aGVsbG8=";

describe("Excel export photo pipeline", () => {
  it("builds leak and monitoring archive entries with stable identities", async () => {
    const leaks = [
      {
        id: 7,
        leak_id: "TAG-7",
        photo: PNG_DATA_URI,
        monitoringRecords: [
          {
            id: "record-1",
            date: "2026-08-01T10:00:00.000Z",
            photo: PNG_DATA_URI,
          },
          {
            id: "record-2",
            date: "2026-08-02T10:00:00.000Z",
            photo: PNG_DATA_URI,
            previousPhoto: PNG_DATA_URI,
          },
        ],
      },
    ];
    const cache = new Map();

    const [leakEntries, monitoringEntries] = await Promise.all([
      buildLeakPhotoEntries(leaks, ["TAG-7"], null, cache),
      buildMonitoringPhotoEntries(
        leaks,
        ["TAG-7"],
        null,
        new Set(["monitoring:0:1"]),
        cache,
      ),
    ]);

    expect(leakEntries).toEqual([
      expect.objectContaining({
        mapKey: "0:photo",
        logicalKey: "id:7:field:photo",
        photoFileName: "photos/TAG-7/before.png",
        base64: "aGVsbG8=",
      }),
    ]);
    expect(monitoringEntries).toEqual([
      expect.objectContaining({
        mapKey: "monitoring:0:1",
        logicalKey: "id:7:monitoring:id:record-2",
        photoFileName: "photos/TAG-7/monitoring/record-2.png",
      }),
      expect.objectContaining({
        mapKey: "monitoring:0:1:previousPhoto",
        logicalKey: "id:7:monitoring:id:record-2:field:previousPhoto",
        photoFileName: "photos/TAG-7/monitoring/record-2-previousPhoto.png",
      }),
    ]);
  });

  it("deduplicates reads from IndexedDB through the shared cache", async () => {
    const idbGet = vi.fn().mockResolvedValue(PNG_DATA_URI);
    const leaks = [
      {
        leak_id: "TAG-1",
        photo: "idb://same-photo",
        photo_after: "idb://same-photo",
      },
    ];

    const entries = await buildLeakPhotoEntries(
      leaks,
      ["TAG-1"],
      idbGet,
      new Map(),
      "report/photos",
    );

    expect(idbGet).toHaveBeenCalledOnce();
    expect(entries.map((entry) => entry.photoFileName)).toEqual([
      "report/photos/TAG-1/before.png",
      "report/photos/TAG-1/after.png",
    ]);
  });

  it("creates the photo lookup and portable leak snapshot", () => {
    const dataPhoto = "data:image/jpeg;base64,YQ==";
    const leaks = [
      {
        leak_id: "TAG-1",
        photo: "idb://before",
        photo_after: "idb://missing",
        photo_repair: dataPhoto,
        monitoringRecords: [
          {
            id: "m1",
            photo: "data://missing",
            previousPhoto: "data://previous",
          },
          { id: "m2", photo: dataPhoto },
          { id: "m3" },
        ],
      },
    ];
    const photoMap = buildPhotoMap([
      { mapKey: "0:photo", photoFileName: "photos/TAG-1/before.jpg" },
      {
        mapKey: "monitoring:0:0",
        photoFileName: "photos/TAG-1/monitoring/record-1.jpg",
      },
      {
        mapKey: "monitoring:0:0:previousPhoto",
        photoFileName: "photos/TAG-1/monitoring/record-1-previousPhoto.jpg",
      },
    ]);

    const [portable] = buildPortableLeaks(leaks, photoMap);

    expect(portable.photo).toBe("zip:photos/TAG-1/before.jpg");
    expect(portable).not.toHaveProperty("photo_after");
    expect(portable.photo_repair).toBe(dataPhoto);
    expect(portable.monitoringRecords[0].photo).toBe(
      "zip:photos/TAG-1/monitoring/record-1.jpg",
    );
    expect(portable.monitoringRecords[0].previousPhoto).toBe(
      "zip:photos/TAG-1/monitoring/record-1-previousPhoto.jpg",
    );
    expect(portable.monitoringRecords[1].photo).toBe(dataPhoto);
    expect(portable.monitoringRecords[2]).not.toHaveProperty("photo");
  });

  it("ignores missing and malformed photo sources", async () => {
    const idbGet = vi.fn().mockResolvedValue(null);
    const entries = await buildLeakPhotoEntries(
      [
        {
          leak_id: "TAG-1",
          photo: "idb://missing",
          photo_after: "data:image/png;base64,not-valid!",
        },
      ],
      ["TAG-1"],
      idbGet,
      new Map(),
    );

    expect(entries).toEqual([]);
  });
});
