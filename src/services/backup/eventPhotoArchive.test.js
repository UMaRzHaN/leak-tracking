import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn(),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

const { exportLeaksWithPhotos } = await import("./photoArchive");
const { restorePhotos } = await import("./photoRestore");

const jpeg = (tag) => `data:image/jpeg;base64,${btoa(tag)}`;

const REPAIR_FIRST = jpeg("repair-1");
const REPAIR_SECOND = jpeg("repair-2");
const ROUND = jpeg("round-1");

/**
 * Утечку чинили дважды. Снимок второй починки лежит в полях записи, снимок
 * обхода — в его записи, а снимок первой не остаётся нигде, кроме ленты.
 */
function twiceRepairedLeak() {
  return {
    id: "leak-1",
    leak_id: "TAG-1",
    status: "in_progress",
    photo_repair: REPAIR_SECOND,
    monitoringRecords: [
      { id: "r-1", date: "2026-08-02T10:00:00.000Z", photo: ROUND },
    ],
    events: [
      {
        id: "e1",
        type: "repair_started",
        date: "2026-08-01T10:00:00.000Z",
        photo: REPAIR_FIRST,
      },
      {
        id: "r-1",
        type: "inspection",
        date: "2026-08-02T10:00:00.000Z",
        photo: ROUND,
      },
      {
        id: "e2",
        type: "repair_started",
        date: "2026-08-03T10:00:00.000Z",
        photo: REPAIR_SECOND,
      },
    ],
  };
}

describe("снимки ленты событий в архиве", () => {
  it("кладёт фото первой починки и не дублирует остальные", async () => {
    const zip = new JSZip();
    const [exported] = await exportLeaksWithPhotos(
      [twiceRepairedLeak()],
      zip,
      null,
    );

    const files = Object.keys(zip.files).filter(
      (name) => name.startsWith("photos/") && !zip.files[name].dir,
    );
    // Три снимка, а не пять: осмотр и второй ремонт уже записаны своими
    // владельцами, лента переиспользует их пути.
    expect(files).toHaveLength(3);
    expect(files.filter((name) => name.includes("/events/"))).toHaveLength(1);

    const [first, inspection, second] = exported.events;
    expect(first.photo).toMatch(/^zip:photos\/.*\/events\/event-1\.jpg$/);
    expect(inspection.photo).toBe(exported.monitoringRecords[0].photo);
    expect(second.photo).toBe(exported.photo_repair);
  });

  it("возвращает снимки на устройство, не размножая общие", async () => {
    const zip = new JSZip();
    const [exported] = await exportLeaksWithPhotos(
      [twiceRepairedLeak()],
      zip,
      null,
    );

    const photos = {
      declaredSize: () => 1024,
      read: async (path) => new Blob([path], { type: "image/jpeg" }),
    };
    const savePhoto = vi.fn(
      async (_blob, storageKey) => `idb://${storageKey}.jpg`,
    );

    const [restored] = await restorePhotos([exported], photos, savePhoto);

    // Три сохранения на три разных файла: общий снимок раскладывается один раз.
    expect(savePhoto).toHaveBeenCalledTimes(3);

    const [first, inspection, second] = restored.events;
    expect(inspection.photo).toBe(restored.monitoringRecords[0].photo);
    expect(second.photo).toBe(restored.photo_repair);
    expect(first.photo).not.toBe(second.photo);
    expect(first.photo).toMatch(/^idb:\/\//);
  });
});
