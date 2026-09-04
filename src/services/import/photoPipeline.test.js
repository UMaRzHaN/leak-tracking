import { describe, expect, it, vi } from "vitest";
import { fingerprintBlob } from "@/utils/blobHash";

const photoService = vi.hoisted(() => ({
  getPhotoBlob: vi.fn().mockResolvedValue(null),
  getPhotoSrc: vi.fn().mockResolvedValue(null),
  photoExists: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/hooks/photoService", () => photoService);
import {
  hydrateZipPhotos,
  persistExcelImportPhotos,
  reconcileExcelImportPhotos,
  rollbackExcelImportPhotos,
} from "./photoPipeline";

describe("hydrateZipPhotos", () => {
  it("materializes a shared ZIP entry only once", async () => {
    const streamRead = vi.fn(() => {
      const handlers = {};
      return {
        on(event, handler) {
          handlers[event] = handler;
          return this;
        },
        pause() {},
        resume() {
          handlers.data(new Uint8Array([1, 2, 3]));
          handlers.end?.();
        },
      };
    });
    const zip = {
      file: vi.fn(() => ({
        name: "photos/shared.jpg",
        dir: false,
        internalStream: streamRead,
      })),
    };
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

    expect(streamRead).toHaveBeenCalledOnce();
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

  it("оживляет снимок из ленты событий, а не оставляет мёртвую ссылку", async () => {
    // Фото прежней починки лежит только в ленте: в полях утечки его уже нет,
    // в записях обхода не было никогда. Без этого прохода из книги
    // возвращалась строка «zip:...», указывающая на файл, которого после
    // импорта не существует.
    const streamRead = vi.fn(() => {
      const handlers = {};
      return {
        on(event, handler) {
          handlers[event] = handler;
          return this;
        },
        pause() {},
        resume() {
          handlers.data(new Uint8Array([9, 9, 9]));
          handlers.end?.();
        },
      };
    });
    const zip = {
      file: vi.fn(() => ({
        name: "photos/leak-1/events/event-1.jpg",
        dir: false,
        internalStream: streamRead,
      })),
    };

    const result = await hydrateZipPhotos(
      {
        leaks: [
          {
            id: "one",
            events: [
              {
                id: "e1",
                type: "repair_started",
                date: "2026-08-01T08:00:00.000Z",
                photo: "zip:photos/leak-1/events/event-1.jpg",
              },
              {
                id: "e2",
                type: "repair_done",
                date: "2026-08-01T14:00:00.000Z",
              },
            ],
          },
        ],
        stats: {},
      },
      zip,
    );

    const [started, done] = result.leaks[0].events;
    expect(started.photo).toBeInstanceOf(Blob);
    expect(done.photo).toBeUndefined();
    expect(result.stats).toMatchObject({
      restoredPhotos: 1,
      photoReferences: 1,
    });
  });

  it("сообщает о снимке ленты, которого в архиве не оказалось", async () => {
    const zip = { file: vi.fn(() => null) };

    const result = await hydrateZipPhotos(
      {
        leaks: [
          {
            id: "one",
            events: [
              {
                id: "e1",
                type: "repair_started",
                photo: "zip:photos/gone.jpg",
              },
            ],
          },
        ],
        stats: {},
      },
      zip,
    );

    // Путь снимается, а не остаётся обещанием файла, которого нет.
    expect(result.leaks[0].events[0].photo).toBeUndefined();
    expect(result.stats).toMatchObject({ missingPhotos: 1 });
  });
});

describe("reconcileExcelImportPhotos concurrency", () => {
  it("limits storage reads and preserves incoming leak order", async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    const existing = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: `idb://existing-${index + 1}`,
    }));
    const incoming = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: new Blob([`incoming-${index + 1}`], { type: "image/jpeg" }),
    }));
    const getStoredPhoto = vi.fn(async (key) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeReads -= 1;
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
      { concurrency: 2, reusablePhotoConcurrency: 2 },
    );

    expect(maxActiveReads).toBeLessThanOrEqual(2);
    expect(result.leaks.map((leak) => leak.leak_id)).toEqual(
      incoming.map((leak) => leak.leak_id),
    );
    expect(result.photos).toMatchObject({ replaced: 8, toSave: 8 });
  });

  it("limits rollback deletions and continues after individual failures", async () => {
    let activeDeletes = 0;
    let maxActiveDeletes = 0;
    const attempted = [];
    const paths = Array.from({ length: 7 }, (_, index) => `idb://p-${index}`);

    await rollbackExcelImportPhotos(
      [...paths, paths[0]],
      async (path) => {
        activeDeletes += 1;
        maxActiveDeletes = Math.max(maxActiveDeletes, activeDeletes);
        await new Promise((resolve) => setTimeout(resolve, 3));
        activeDeletes -= 1;
        attempted.push(path);
        if (path === paths[2]) throw new Error("delete failed");
      },
      { concurrency: 2 },
    );

    expect(maxActiveDeletes).toBeLessThanOrEqual(2);
    expect(new Set(attempted)).toEqual(new Set(paths));
    expect(attempted).toHaveLength(paths.length);
  });

  it("does not multiply concurrency for nested monitoring photos", async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    const existing = Array.from({ length: 3 }, (_, leakIndex) => ({
      leak_id: `MON-${leakIndex + 1}`,
      monitoringRecords: Array.from({ length: 5 }, (_, recordIndex) => ({
        id: `R-${recordIndex + 1}`,
        photo: `idb://existing-${leakIndex + 1}-${recordIndex + 1}`,
      })),
    }));
    const incoming = existing.map((leak, leakIndex) => ({
      leak_id: leak.leak_id,
      monitoringRecords: leak.monitoringRecords.map((record, recordIndex) => ({
        id: record.id,
        photo: new Blob([`incoming-${leakIndex + 1}-${recordIndex + 1}`], {
          type: "image/jpeg",
        }),
      })),
    }));
    const getStoredPhoto = vi.fn(async (key) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 3));
      activeReads -= 1;
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
      { concurrency: 2, reusablePhotoConcurrency: 2 },
    );

    expect(maxActiveReads).toBeLessThanOrEqual(2);
    expect(result.leaks).toHaveLength(3);
    expect(result.photos).toMatchObject({ replaced: 15, toSave: 15 });
  });
});

describe("reconcileExcelImportPhotos content-addressed slots", () => {
  async function storedPathFor(blob, { leakId = "TAG-1" } = {}) {
    return `idb://photo_p1_${leakId}_h_${await fingerprintBlob(blob)}`;
  }

  it("reuses an unchanged photo without reading it back for comparison", async () => {
    const photo = new Blob(["same-photo"], { type: "image/jpeg" });
    const storedPath = await storedPathFor(photo);
    const getStoredPhoto = vi.fn(async () => photo);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: storedPath }],
      [{ leak_id: "TAG-1", photo }],
      getStoredPhoto,
    );

    expect(result.leaks[0].photo).toBe(storedPath);
    expect(result.photos).toMatchObject({ reused: 1, replaced: 0, toSave: 0 });
  });

  /*
   * The regression these guard against: the fingerprint in a file name says
   * which photo the slot holds, not that the file is still there. Merging two
   * databases fills the record with paths belonging to the other phone, and
   * trusting the name alone substituted those for the real bytes — the photo
   * then vanished from both devices.
   */
  it("re-saves a photo whose stored file is missing instead of pointing at it", async () => {
    const photo = new Blob(["same-photo"], { type: "image/jpeg" });
    const storedPath = await storedPathFor(photo);
    const getStoredPhoto = vi.fn(async () => null);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: storedPath }],
      [{ leak_id: "TAG-1", photo }],
      getStoredPhoto,
    );

    expect(result.leaks[0].photo).toBe(photo);
    expect(result.photos).toMatchObject({
      reused: 0,
      replaced: 1,
      toSave: 1,
      replacedByReason: { unreadable: 1 },
    });
  });

  it("keeps a missing photo out of the reuse map", async () => {
    const photo = new Blob(["moved-photo"], { type: "image/jpeg" });
    const missingPath = await storedPathFor(photo, { leakId: "TAG-1" });
    const getStoredPhoto = vi.fn(async () => null);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: missingPath }],
      [{ leak_id: "TAG-2", photo }],
      getStoredPhoto,
    );

    expect(result.leaks[0].photo).toBe(photo);
    expect(result.photos).toMatchObject({ added: 1, reused: 0, toSave: 1 });
  });

  it("replaces a changed photo without reading it back", async () => {
    const storedPath = await storedPathFor(
      new Blob(["old-photo"], { type: "image/jpeg" }),
    );
    const photo = new Blob(["new-photo"], { type: "image/jpeg" });
    const getStoredPhoto = vi.fn(async () => new Blob(["old-photo"]));

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: storedPath }],
      [{ leak_id: "TAG-1", photo }],
      getStoredPhoto,
    );

    expect(result.leaks[0].photo).toBe(photo);
    expect(result.photos).toMatchObject({
      replaced: 1,
      toSave: 1,
      replacedByReason: { different: 1 },
    });
  });

  it("matches a photo that moved to another leak", async () => {
    const photo = new Blob(["moved-photo"], { type: "image/jpeg" });
    const storedPath = await storedPathFor(photo, { leakId: "TAG-1" });
    const getStoredPhoto = vi.fn(async () => photo);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: storedPath }],
      [{ leak_id: "TAG-2", photo }],
      getStoredPhoto,
    );

    expect(result.leaks[0].photo).toBe(storedPath);
    expect(result.photos).toMatchObject({ reused: 1, toSave: 0 });
  });

  it("still reads camera photos, which carry no hash in their name", async () => {
    const photo = new Blob(["camera-photo"], { type: "image/jpeg" });
    const getStoredPhoto = vi.fn(async () => photo);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: "idb://photo_p1_TAG-1_1755772800000" }],
      [{ leak_id: "TAG-1", photo }],
      getStoredPhoto,
    );

    expect(getStoredPhoto).toHaveBeenCalled();
    expect(result.photos).toMatchObject({ reused: 1, toSave: 0 });
  });
});

/*
 * The defaults below were measured on a device, not chosen — see
 * performance/README.md. Every other test here passes its own concurrency, so
 * without these nothing would fail if someone restored the unmeasured 3.
 * They assert the observed maximum exactly: a bound of "<= 2" would keep
 * passing if a default silently dropped to 1.
 */
describe("photo pipeline default concurrency", () => {
  function createConcurrencyProbe(delayMs = 5) {
    let active = 0;
    const probe = {
      max: 0,
      async enter() {
        active += 1;
        probe.max = Math.max(probe.max, active);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        active -= 1;
      },
    };
    return probe;
  }

  it("persists photos two at a time", async () => {
    const probe = createConcurrencyProbe();
    const leaks = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: new Blob([`photo-${index + 1}`], { type: "image/jpeg" }),
    }));
    const savePhoto = vi.fn(async (_blob, leakId) => {
      await probe.enter();
      return `idb://saved-${leakId}`;
    });

    await persistExcelImportPhotos(leaks, savePhoto);

    expect(savePhoto).toHaveBeenCalledTimes(8);
    expect(probe.max).toBe(2);
  });

  it("rolls back deletions two at a time", async () => {
    const probe = createConcurrencyProbe();
    const paths = Array.from({ length: 8 }, (_, index) => `idb://p-${index}`);

    await rollbackExcelImportPhotos(paths, async () => {
      await probe.enter();
    });

    expect(probe.max).toBe(2);
  });

  it("builds the reusable photo map two at a time", async () => {
    const probe = createConcurrencyProbe();
    // A high explicit concurrency plus photoless incoming leaks isolates the
    // reusable-map pass: it is capped at min(concurrency, the reusable
    // default), and nothing else reaches storage.
    const existing = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: `idb://existing-${index + 1}`,
    }));
    const incoming = existing.map((leak) => ({ leak_id: leak.leak_id }));
    const getStoredPhoto = vi.fn(async (key) => {
      await probe.enter();
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    await reconcileExcelImportPhotos(existing, incoming, getStoredPhoto, {
      concurrency: 8,
    });

    expect(getStoredPhoto).toHaveBeenCalled();
    expect(probe.max).toBe(2);
  });

  it("reconciles leaks two at a time", async () => {
    const probe = createConcurrencyProbe();
    // The reusable pass is pinned to 1 explicitly, so the maximum observed
    // across the run belongs to the per-leak pass and its default.
    const existing = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: `idb://existing-${index + 1}`,
    }));
    const incoming = Array.from({ length: 8 }, (_, index) => ({
      leak_id: `TAG-${index + 1}`,
      photo: new Blob([`incoming-${index + 1}`], { type: "image/jpeg" }),
    }));
    const getStoredPhoto = vi.fn(async (key) => {
      await probe.enter();
      return new Blob([`stored-${key}`], { type: "image/jpeg" });
    });

    await reconcileExcelImportPhotos(existing, incoming, getStoredPhoto, {
      reusablePhotoConcurrency: 1,
    });

    expect(probe.max).toBe(2);
  });
});

describe("photo pipeline edge cases", () => {
  it("returns leaks untouched when no savePhoto is provided", async () => {
    const leaks = [{ leak_id: "TAG-1", photo: new Blob(["x"]) }];

    await expect(persistExcelImportPhotos(leaks, undefined)).resolves.toBe(
      leaks,
    );
    await expect(
      persistExcelImportPhotos(leaks, undefined, { returnTransaction: true }),
    ).resolves.toEqual({ leaks, createdPaths: [] });
  });

  it("counts an unreadable stored photo as a replacement", async () => {
    const existing = [{ leak_id: "TAG-1", photo: "idb://broken" }];
    const incoming = [
      { leak_id: "TAG-1", photo: new Blob(["new"], { type: "image/jpeg" }) },
    ];
    const getStoredPhoto = vi.fn(async () => {
      throw new Error("storage read failed");
    });

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
    );

    expect(getStoredPhoto).toHaveBeenCalled();
    expect(result.photos.replaced).toBe(1);
    expect(result.photos.replacedByReason.unreadable).toBe(1);
  });
});

describe("reconcileExcelImportPhotos device-stored slots", () => {
  const devicePath = (hash) =>
    `data://LeakReports/site/photos/photo_TAG-1_h_${hash}.jpg`;

  it("reuses a photo the device still holds", async () => {
    const photo = new Blob(["device-photo"], { type: "image/jpeg" });
    const path = devicePath(await fingerprintBlob(photo));
    photoService.photoExists.mockResolvedValue(true);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: path }],
      [{ leak_id: "TAG-1", photo }],
      null,
    );

    expect(photoService.photoExists).toHaveBeenCalledWith(path);
    expect(result.leaks[0].photo).toBe(path);
    expect(result.photos).toMatchObject({ reused: 1, toSave: 0 });
  });

  it("re-saves a photo whose file the device no longer has", async () => {
    const photo = new Blob(["device-photo"], { type: "image/jpeg" });
    const path = devicePath(await fingerprintBlob(photo));
    photoService.photoExists.mockResolvedValue(false);

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: path }],
      [{ leak_id: "TAG-1", photo }],
      null,
    );

    expect(result.leaks[0].photo).toBe(photo);
    expect(result.photos).toMatchObject({ toSave: 1 });
  });

  it("treats an unreadable storage answer as a missing file", async () => {
    const photo = new Blob(["device-photo"], { type: "image/jpeg" });
    const path = devicePath(await fingerprintBlob(photo));
    photoService.photoExists.mockRejectedValue(new Error("хранилище молчит"));

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: path }],
      [{ leak_id: "TAG-1", photo }],
      null,
    );

    expect(result.leaks[0].photo).toBe(photo);
    photoService.photoExists.mockResolvedValue(true);
  });

  it("asks storage nothing about a slot with no path at all", async () => {
    photoService.photoExists.mockClear();
    const photo = new Blob(["fresh"], { type: "image/jpeg" });

    const result = await reconcileExcelImportPhotos(
      [],
      [{ leak_id: "TAG-9", photo }],
      null,
    );

    expect(photoService.photoExists).not.toHaveBeenCalled();
    expect(result.photos).toMatchObject({ added: 1 });
  });
});

describe("reconcileExcelImportPhotos и лента событий", () => {
  const blob = (text) => new Blob([text], { type: "image/jpeg" });

  it("сверяет снимки событий, а не только полей и обходов", async () => {
    const existing = [
      {
        leak_id: "TAG-1",
        events: [
          {
            id: "e1",
            type: "repair_started",
            date: "2026-08-01T08:00:00.000Z",
            photo: "idb://existing-repair",
          },
        ],
      },
    ];
    const incoming = [
      {
        leak_id: "TAG-1",
        events: [
          {
            id: "e1",
            type: "repair_started",
            date: "2026-08-01T08:00:00.000Z",
            photo: blob("новый снимок починки"),
          },
        ],
      },
    ];
    const getStoredPhoto = vi.fn(async () => blob("прежний снимок починки"));

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
    );

    expect(result.leaks[0].events[0].photo).toBeInstanceOf(Blob);
    expect(result.photos.replaced).toBe(1);
  });

  it("узнаёт событие по номеру, а не по месту в ленте", async () => {
    // Ленты двух телефонов сводятся объединением, и порядок у них разный:
    // сверка по месту приписала бы снимок чужой починке.
    const existing = [
      {
        leak_id: "TAG-1",
        events: [
          {
            id: "a",
            type: "repair_started",
            date: "2026-08-01T08:00:00.000Z",
            photo: "idb://photo-a",
          },
          {
            id: "b",
            type: "repair_done",
            date: "2026-08-01T14:00:00.000Z",
            photo: "idb://photo-b",
          },
        ],
      },
    ];
    const shared = blob("тот же снимок b");
    const incoming = [
      {
        leak_id: "TAG-1",
        events: [
          {
            id: "b",
            type: "repair_done",
            date: "2026-08-01T14:00:00.000Z",
            photo: shared,
          },
          {
            id: "a",
            type: "repair_started",
            date: "2026-08-01T08:00:00.000Z",
            photo: blob("новый a"),
          },
        ],
      },
    ];
    const getStoredPhoto = vi.fn(async (key) =>
      key.includes("photo-b") ? shared : blob("прежний a"),
    );

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      getStoredPhoto,
    );

    // У «b» снимок тот же — его переиспользуют, а не перезаписывают.
    const eventB = result.leaks[0].events.find((event) => event.id === "b");
    expect(eventB.photo).toBe("idb://photo-b");
    expect(result.photos.reused).toBe(1);
  });

  it("оставляет событие без снимка, когда его и не было", async () => {
    const result = await reconcileExcelImportPhotos(
      [
        {
          leak_id: "TAG-1",
          events: [
            { id: "e1", type: "detected", date: "2026-08-01T08:00:00.000Z" },
          ],
        },
      ],
      [
        {
          leak_id: "TAG-1",
          events: [
            { id: "e1", type: "detected", date: "2026-08-01T08:00:00.000Z" },
          ],
        },
      ],
      vi.fn(async () => null),
    );

    expect(result.leaks[0].events[0].photo).toBeUndefined();
    expect(result.photos.toSave).toBe(0);
  });

  it("собирает пути событий в список переиспользуемых", async () => {
    // Снимок события, уже лежащий на устройстве, должен находиться по
    // содержимому, а не сохраняться заново под новым именем.
    const content = blob("общий снимок");
    const hash = await fingerprintBlob(content);
    const existing = [
      {
        leak_id: "TAG-1",
        events: [
          {
            id: "e1",
            type: "repair_done",
            date: "2026-08-01T14:00:00.000Z",
            photo: `idb://photo_p1_TAG-1_h_${hash}`,
          },
        ],
      },
    ];
    const incoming = [
      {
        leak_id: "TAG-1",
        photo: content,
        events: [
          {
            id: "e1",
            type: "repair_done",
            date: "2026-08-01T14:00:00.000Z",
            photo: content,
          },
        ],
      },
    ];

    const result = await reconcileExcelImportPhotos(
      existing,
      incoming,
      vi.fn(async () => content),
    );

    expect(result.leaks[0].events[0].photo).toBe(
      `idb://photo_p1_TAG-1_h_${hash}`,
    );
  });
});

describe("чтение прежнего снимка при сверке", () => {
  const blob = (text) => new Blob([text], { type: "image/jpeg" });
  const dataUri = (text) => `data:image/jpeg;base64,${btoa(text)}`;

  const reconcileOne = (existingPath, getStoredPhoto) =>
    reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: existingPath }],
      [{ leak_id: "TAG-1", photo: blob("новый") }],
      getStoredPhoto,
    );

  it("принимает снимок, отданный как data-URI, а не как Blob", async () => {
    // Веб-хранилище отдаёт строку, устройство — двоичные данные; сверке нужны
    // байты в обоих случаях.
    const result = await reconcileOne(
      "idb://stored",
      vi.fn(async () => dataUri("stored-before")),
    );

    expect(result.photos.replaced).toBe(1);
  });

  it("считает снимок нечитаемым, когда хранилище отдаёт мусор", async () => {
    const result = await reconcileOne(
      "idb://stored",
      vi.fn(async () => "не картинка"),
    );

    expect(result.photos.replacedByReason.unreadable).toBe(1);
  });

  it("обходится без читателя хранилища вовсе", async () => {
    // Ввоз книги в проект, где снимков ещё нет: читать нечего, и сверка не
    // должна на этом падать.
    const result = await reconcileOne("idb://stored", null);

    expect(result.photos.replaced).toBe(1);
  });

  it("читает снимок по пути устройства через фотослужбу", async () => {
    photoService.getPhotoBlob.mockResolvedValueOnce(blob("прежний с диска"));

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: "data://LeakReports/alpha/photos/p.jpg" }],
      [{ leak_id: "TAG-1", photo: blob("новый") }],
      vi.fn(async () => null),
    );

    expect(photoService.getPhotoBlob).toHaveBeenCalled();
    expect(result.photos.replaced).toBe(1);
  });

  it("падает обратно на строковый источник, когда байтов не дали", async () => {
    photoService.getPhotoBlob.mockResolvedValueOnce(null);
    photoService.getPhotoSrc.mockResolvedValueOnce(dataUri("via-src"));

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: "data://LeakReports/alpha/photos/p.jpg" }],
      [{ leak_id: "TAG-1", photo: blob("новый") }],
      vi.fn(async () => null),
    );

    expect(photoService.getPhotoSrc).toHaveBeenCalled();
    expect(result.photos.replaced).toBe(1);
  });

  it("не роняет сверку, когда хранилище бросает на проверке наличия", async () => {
    const content = blob("тот же");
    const hash = await fingerprintBlob(content);
    const getStoredPhoto = vi.fn(async () => {
      throw new Error("хранилище недоступно");
    });

    const result = await reconcileExcelImportPhotos(
      [{ leak_id: "TAG-1", photo: `idb://photo_p1_TAG-1_h_${hash}` }],
      [{ leak_id: "TAG-1", photo: content }],
      getStoredPhoto,
    );

    expect(result.leaks[0].photo).toBeInstanceOf(Blob);
  });
});
