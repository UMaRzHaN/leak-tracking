import { describe, expect, it } from "vitest";
import {
  LEAK_EVENT_TYPES,
  appendLeakEvent,
  createLeakEvent,
  getEventsOfType,
  getLastLeakEvent,
  getRepairDurations,
  getRepairIterations,
  migrateLeakEvents,
} from "@/domain/leakEvents";

const DAY = 24 * 60 * 60 * 1000;
const DETECTED_AT = Date.UTC(2026, 0, 10, 8, 0, 0);

function legacyLeak(overrides = {}) {
  return {
    id: "leak-1",
    status: "resolved",
    createdAt: DETECTED_AT,
    detectedBy: "Иванов",
    repairAt: DETECTED_AT + DAY,
    resolvedAt: DETECTED_AT + 2 * DAY,
    photo_repair: "idb://photo-repair",
    photo_after: "idb://photo-after",
    ...overrides,
  };
}

describe("миграция старой записи", () => {
  it("разворачивает вехи ремонта в события", () => {
    const { events } = migrateLeakEvents(legacyLeak());

    expect(events.map((event) => event.type)).toEqual([
      LEAK_EVENT_TYPES.DETECTED,
      LEAK_EVENT_TYPES.REPAIR_STARTED,
      LEAK_EVENT_TYPES.REPAIR_DONE,
    ]);
    expect(events[1].photo).toBe("idb://photo-repair");
    expect(events[2].photo).toBe("idb://photo-after");
    expect(events[0].user).toBe("Иванов");
  });

  it("не приписывает событию обнаружения главный снимок карточки", () => {
    // `photo` после ремонта — это уже снимок «после», а не находки.
    const { events } = migrateLeakEvents(
      legacyLeak({ photo: "idb://photo-main" }),
    );

    expect(events[0].photo).toBeUndefined();
  });

  it("переносит записи обхода осмотрами, не переименовывая поля", () => {
    const { events } = migrateLeakEvents(
      legacyLeak({
        monitoringRecords: [
          {
            id: "round-1",
            date: new Date(DETECTED_AT + 3 * DAY).toISOString(),
            result: "still_leaking",
            monitoredBy: "Петров",
            roundId: "r-1",
            roundNumber: 2,
            photo: "idb://round-photo",
          },
        ],
      }),
    );

    const inspection = events.at(-1);
    expect(inspection.type).toBe(LEAK_EVENT_TYPES.INSPECTION);
    expect(inspection.id).toBe("round-1");
    expect(inspection.monitoredBy).toBe("Петров");
    expect(inspection.roundId).toBe("r-1");
    expect(inspection.roundNumber).toBe(2);
  });

  it("читает дату утечки, записанную человеком", () => {
    const { events } = migrateLeakEvents({
      id: "leak-2",
      status: "open",
      // 9 октября, а не 10 сентября: `Date.parse` здесь ошибается.
      date: "09.10.2026",
    });

    expect(events).toHaveLength(1);
    expect(events[0].date.slice(0, 10)).toBe("2026-10-09");
  });

  it("не создаёт событие из неразобранной даты", () => {
    const migrated = migrateLeakEvents({
      id: "leak-3",
      status: "open",
      date: "как-нибудь потом",
    });

    expect(migrated.events).toBeUndefined();
  });

  it("повторный прогон ничего не меняет", () => {
    const once = migrateLeakEvents(legacyLeak());
    const twice = migrateLeakEvents(once);

    expect(twice).toBe(once);
  });

  it("выдаёт одинаковые номера событий на разных устройствах", () => {
    // Случайный номер здесь раздвоил бы один ремонт на два при обмене.
    const first = migrateLeakEvents(legacyLeak());
    const second = migrateLeakEvents(legacyLeak());

    expect(second.events.map((event) => event.id)).toEqual(
      first.events.map((event) => event.id),
    );
  });

  it("подмешивает осмотры, пришедшие со старой сборки, к готовой ленте", () => {
    const migrated = migrateLeakEvents(legacyLeak());
    const fromOldDevice = {
      ...migrated,
      monitoringRecords: [
        {
          id: "round-9",
          date: new Date(DETECTED_AT + 4 * DAY).toISOString(),
          result: "resolved",
        },
      ],
    };

    const merged = migrateLeakEvents(fromOldDevice);
    expect(merged.events).toHaveLength(migrated.events.length + 1);
    expect(migrateLeakEvents(merged)).toBe(merged);
  });
});

describe("лента событий", () => {
  it("держит порядок по дате при дописывании", () => {
    const leak = appendLeakEvent(
      appendLeakEvent(
        { id: "leak-4" },
        {
          type: LEAK_EVENT_TYPES.REPAIR_DONE,
          date: new Date(DETECTED_AT + 2 * DAY).toISOString(),
        },
      ),
      {
        type: LEAK_EVENT_TYPES.REPAIR_STARTED,
        date: new Date(DETECTED_AT + DAY).toISOString(),
      },
    );

    expect(leak.events.map((event) => event.type)).toEqual([
      LEAK_EVENT_TYPES.REPAIR_STARTED,
      LEAK_EVENT_TYPES.REPAIR_DONE,
    ]);
  });

  it("отказывается создавать событие неизвестного типа", () => {
    expect(() => createLeakEvent({ type: "repaired" })).toThrowError(
      /Unknown leak event type/,
    );
  });

  it("отбирает события по типу и отдаёт последнее", () => {
    const leak = migrateLeakEvents(legacyLeak());

    expect(getEventsOfType(leak, LEAK_EVENT_TYPES.REPAIR_DONE)).toHaveLength(1);
    expect(getLastLeakEvent(leak).type).toBe(LEAK_EVENT_TYPES.REPAIR_DONE);
  });
});

describe("попытки ремонта", () => {
  const twiceRepaired = {
    id: "leak-5",
    events: [
      {
        id: "e1",
        type: LEAK_EVENT_TYPES.REPAIR_STARTED,
        date: new Date(DETECTED_AT + DAY).toISOString(),
      },
      {
        id: "e2",
        type: LEAK_EVENT_TYPES.REPAIR_DONE,
        date: new Date(DETECTED_AT + 2 * DAY).toISOString(),
      },
      {
        id: "e3",
        type: LEAK_EVENT_TYPES.REPAIR_STARTED,
        date: new Date(DETECTED_AT + 5 * DAY).toISOString(),
      },
      {
        id: "e4",
        type: LEAK_EVENT_TYPES.REPAIR_DONE,
        date: new Date(DETECTED_AT + 6 * DAY).toISOString(),
      },
    ],
  };

  it("считает вернувшуюся утечку второй попыткой, а не заменой первой", () => {
    expect(getRepairIterations(twiceRepaired)).toHaveLength(2);
    expect(getRepairDurations(twiceRepaired)).toEqual([DAY, DAY]);
  });

  it("оставляет незакрытую попытку в списке", () => {
    const inProgress = {
      id: "leak-6",
      events: [
        {
          id: "e1",
          type: LEAK_EVENT_TYPES.REPAIR_STARTED,
          date: new Date(DETECTED_AT + DAY).toISOString(),
        },
      ],
    };

    expect(getRepairIterations(inProgress)).toEqual([
      { started: inProgress.events[0], done: null },
    ]);
    expect(getRepairDurations(inProgress)).toEqual([]);
  });

  it("переживает завершение без сохранившегося начала", () => {
    const onlyDone = {
      id: "leak-7",
      events: [
        {
          id: "e1",
          type: LEAK_EVENT_TYPES.REPAIR_DONE,
          date: new Date(DETECTED_AT + DAY).toISOString(),
        },
      ],
    };

    expect(getRepairIterations(onlyDone)).toEqual([
      { started: null, done: onlyDone.events[0] },
    ]);
    expect(getRepairDurations(onlyDone)).toEqual([]);
  });
});
