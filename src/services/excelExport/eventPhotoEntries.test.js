import { describe, expect, it } from "vitest";
import {
  buildEventPhotoEntries,
  buildPhotoMap,
  buildPortableLeaks,
  collectEventPhotoAliases,
  getEventPhotoMapKey,
} from "./photoPipeline";

const jpeg = (tag) => `data:image/jpeg;base64,${btoa(tag)}`;
const SHARED = jpeg("shared");
const OWN = jpeg("own");

/**
 * Утечка, которую чинили дважды.
 *
 * Снимок нынешней починки — тот же, что стоит в колонке «Фото в ремонте»:
 * колонка выводится из ленты, и отдельного файла ему не нужно. А снимок
 * первой починки после второй не остаётся нигде, кроме ленты, — он и получает
 * своё место.
 */
const leakWithEvents = () => ({
  id: 1,
  leak_id: "A-42",
  events: [
    { id: "e1", type: "repair_started", date: "2026-08-01", photo: OWN },
    { id: "e2", type: "repair_done", date: "2026-08-02", photo: OWN },
    { id: "e3", type: "repair_started", date: "2026-08-05", photo: SHARED },
  ],
});

describe("снимки ленты в книге", () => {
  it("берёт только то, чего не выгрузили прежние сборщики", async () => {
    const entries = await buildEventPhotoEntries(
      [leakWithEvents()],
      ["leak-1"],
      null,
      new Set([SHARED]),
      new Map(),
    );

    // Общий снимок уже в книге — второй копии ему не нужно.
    expect(entries.map((entry) => entry.sourcePath)).toEqual([OWN]);
    expect(entries[0].photoFileName).toMatch(
      /^photos\/leak-1\/events\/event-1\.jpg$/,
    );
  });

  it("не двоит снимок, встреченный в ленте дважды", async () => {
    const leak = {
      id: 1,
      events: [
        { id: "e1", type: "repair_started", date: "2026-08-01", photo: OWN },
        { id: "e2", type: "repair_done", date: "2026-08-02", photo: OWN },
      ],
    };

    const entries = await buildEventPhotoEntries(
      [leak],
      ["leak-1"],
      null,
      new Set(),
      new Map(),
    );

    expect(entries).toHaveLength(1);
  });

  it("переписывает пути ленты на файлы книги", () => {
    const photoMap = {
      // Колонка «Фото в ремонте» выведена из ленты и указывает на снимок
      // нынешней починки.
      "0:photo_repair": "photos/leak-1/repair.jpg",
      [getEventPhotoMapKey(0, 0, "photo")]: "photos/leak-1/events/event-1.jpg",
    };

    const [portable] = buildPortableLeaks([leakWithEvents()], photoMap);

    // Снимки прежней починки получили своё место.
    expect(portable.events[0].photo).toBe(
      "zip:photos/leak-1/events/event-1.jpg",
    );
    expect(portable.events[1].photo).toBe(
      "zip:photos/leak-1/events/event-1.jpg",
    );
    // Нынешний ссылается на файл колонки, а не на вторую копию.
    expect(portable.events[2].photo).toBe("zip:photos/leak-1/repair.jpg");
    expect(portable.photo_repair).toBe("zip:photos/leak-1/repair.jpg");
  });

  it("снимает путь устройства у снимка, не попавшего в книгу", () => {
    // Оставить `idb://` значило бы обещать фото, которого в файле нет.
    const leak = {
      id: 1,
      events: [
        {
          id: "e1",
          type: "repair_started",
          date: "2026-08-01",
          photo: "idb://unreadable",
        },
      ],
    };

    const [portable] = buildPortableLeaks([leak], {});

    expect(portable.events[0].photo).toBeUndefined();
  });

  it("сводит записи в карту по их ключам", async () => {
    const entries = await buildEventPhotoEntries(
      [leakWithEvents()],
      ["leak-1"],
      null,
      new Set([SHARED]),
      new Map(),
    );

    expect(buildPhotoMap(entries)).toEqual({
      [getEventPhotoMapKey(0, 0, "photo")]: "photos/leak-1/events/event-1.jpg",
    });
  });

  it("оставляет ключ снимку, файл которому уже завели", () => {
    // Лист ремонтов ищет снимок по ключу события. Второй копии файла общему
    // снимку не нужно, а без ключа лист говорил «есть, файл не найден» про то,
    // что лежит в архиве под именем колонки, — три снимка починки из четырёх.
    const aliases = collectEventPhotoAliases(
      [leakWithEvents()],
      new Set([SHARED]),
    );

    expect(aliases).toEqual([
      // Встреченный в ленте второй раз — файл завело первое событие.
      { mapKey: getEventPhotoMapKey(0, 1, "photo"), sourcePath: OWN },
      // Общий с колонкой — файл у него уже есть.
      { mapKey: getEventPhotoMapKey(0, 2, "photo"), sourcePath: SHARED },
    ]);
  });

  it("не выдаёт ключ снимку, который получил свой файл", async () => {
    const taken = new Set([SHARED]);
    const entries = await buildEventPhotoEntries(
      [leakWithEvents()],
      ["leak-1"],
      null,
      taken,
      new Map(),
    );
    const aliases = collectEventPhotoAliases([leakWithEvents()], taken);

    // Ключи не пересекаются: у снимка либо свой файл, либо ссылка на чужой.
    const own = new Set(entries.map((entry) => entry.mapKey));
    expect(aliases.some((alias) => own.has(alias.mapKey))).toBe(false);
  });
});
