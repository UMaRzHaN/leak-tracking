import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn(),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

const { exportLeaksWithPhotosToStream } = await import("./photoArchive");

const jpeg = (tag) => `data:image/jpeg;base64,${btoa(tag)}`;

/**
 * Писатель архива в том виде, в каком его видит выгрузка: у настоящего
 * (`ZipStoreStreamWriter`) она пользуется одним методом — `add`.
 */
function fakeZip() {
  const written = [];
  return {
    written,
    add: (path) => {
      written.push(path);
      return Promise.resolve();
    },
  };
}

const photoNames = (zip) => zip.written.filter((n) => n.startsWith("photos/"));

/**
 * Потоковая выгрузка: тот же архив, но файлы кладутся по мере чтения, а не
 * собираются целиком в памяти. Ею пользуется выгрузка проекта, где утечек
 * могут быть тысячи.
 */
describe("выгрузка снимков потоком", () => {
  it("раскладывает снимки полей, обходов и ленты по своим именам", async () => {
    const zip = fakeZip();

    const [exported] = await exportLeaksWithPhotosToStream(
      [
        {
          id: "leak-1",
          leak_id: "TAG-1",
          photo: jpeg("before"),
          photo_repair: jpeg("repair"),
          monitoringRecords: [
            {
              id: "r-1",
              date: "2026-08-02T10:00:00.000Z",
              photo: jpeg("round"),
            },
          ],
          events: [
            {
              id: "e1",
              type: "repair_started",
              date: "2026-08-01T10:00:00.000Z",
              photo: jpeg("event"),
            },
          ],
        },
      ],
      zip,
      null,
    );

    expect(photoNames(zip)).toHaveLength(4);
    expect(exported.photo).toMatch(/^zip:photos\//);
    expect(exported.photo_repair).toMatch(/^zip:photos\//);
    expect(exported.monitoringRecords[0].photo).toMatch(/^zip:photos\//);
    expect(exported.events[0].photo).toMatch(/^zip:photos\//);
  });

  it("не заводит второй копии снимку, общему у ленты и записи обхода", async () => {
    // Осмотр и его событие несут один и тот же файл: копия в архиве удвоила бы
    // вес выгрузки на ровном месте.
    const shared = jpeg("shared");
    const zip = fakeZip();

    const [exported] = await exportLeaksWithPhotosToStream(
      [
        {
          id: "leak-1",
          monitoringRecords: [
            { id: "r-1", date: "2026-08-02T10:00:00.000Z", photo: shared },
          ],
          events: [
            {
              id: "r-1",
              type: "inspection",
              date: "2026-08-02T10:00:00.000Z",
              photo: shared,
            },
          ],
        },
      ],
      zip,
      null,
    );

    expect(photoNames(zip)).toHaveLength(1);
    expect(exported.events[0].photo).toBe(exported.monitoringRecords[0].photo);
  });

  it("снимает путь снимка, которого прочитать не удалось", async () => {
    // Оставить `idb://` в архиве значило бы обещать фото, которого в файле нет.
    const zip = fakeZip();

    const [exported] = await exportLeaksWithPhotosToStream(
      [
        {
          id: "leak-1",
          photo: "idb://missing",
          events: [
            {
              id: "e1",
              type: "repair_done",
              date: "2026-08-01T10:00:00.000Z",
              photo: "idb://missing-too",
            },
          ],
        },
      ],
      zip,
      async () => null,
    );

    expect(photoNames(zip)).toHaveLength(0);
    expect(exported.photo).toBeUndefined();
    expect(exported.events[0].photo).toBeUndefined();
  });

  it("оставляет непрочитанный путь, когда об этом просят", async () => {
    // Обмен между устройствами читает снимки отдельно: там путь ещё пригодится.
    const zip = fakeZip();

    const [exported] = await exportLeaksWithPhotosToStream(
      [{ id: "leak-1", photo: "idb://missing" }],
      zip,
      async () => null,
      { preserveUnresolvedPhotoPaths: true },
    );

    expect(exported.photo).toBe("idb://missing");
  });

  it("читает снимок с устройства по ссылке idb", async () => {
    const zip = fakeZip();
    const idbGet = vi.fn().mockResolvedValue(jpeg("stored"));

    const [exported] = await exportLeaksWithPhotosToStream(
      [{ id: "leak-1", photo: "idb://photo_1" }],
      zip,
      idbGet,
    );

    expect(idbGet).toHaveBeenCalledWith("photo_1");
    expect(exported.photo).toMatch(/^zip:photos\//);
  });

  it("пропускает то, что утечкой не является", async () => {
    // Файл могли собрать чужой сборкой: строка вместо записи не должна ронять
    // выгрузку целиком.
    const zip = fakeZip();

    const exported = await exportLeaksWithPhotosToStream(
      [null, "не утечка", ["тоже нет"], { id: "leak-1", photo: jpeg("real") }],
      zip,
      null,
    );

    expect(exported[0]).toBeNull();
    expect(exported[1]).toBe("не утечка");
    expect(exported[2]).toEqual(["тоже нет"]);
    expect(exported[3].photo).toMatch(/^zip:photos\//);
  });
});
