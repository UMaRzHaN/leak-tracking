import { describe, expect, it } from "vitest";
import {
  buildEventPhotoEntries,
  buildPhotoMap,
  buildPortableLeaks,
  getEventPhotoMapKey,
} from "./photoPipeline";

const jpeg = (tag) => `data:image/jpeg;base64,${btoa(tag)}`;
const SHARED = jpeg("shared");
const OWN = jpeg("own");

const leakWithEvents = () => ({
  id: 1,
  leak_id: "A-42",
  photo_repair: SHARED,
  events: [
    { id: "e1", type: "repair_started", date: "2026-08-01", photo: OWN },
    { id: "e2", type: "repair_done", date: "2026-08-02", photo: SHARED },
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
      "0:photo_repair": "photos/leak-1/repair.jpg",
      [getEventPhotoMapKey(0, 0, "photo")]: "photos/leak-1/events/event-1.jpg",
    };

    const [portable] = buildPortableLeaks([leakWithEvents()], photoMap);

    expect(portable.events[0].photo).toBe(
      "zip:photos/leak-1/events/event-1.jpg",
    );
    // Общий снимок ссылается на файл своего владельца, а не на вторую копию.
    expect(portable.events[1].photo).toBe("zip:photos/leak-1/repair.jpg");
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
});
