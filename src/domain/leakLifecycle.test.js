import { describe, expect, it, vi } from "vitest";
import {
  getRepairDoneAt,
  getRepairDonePhoto,
  getRepairPhoto,
  getRepairStartedAt,
} from "./leakEvents";
import {
  changeLeakStatus,
  collectLeakPhotoPaths,
  deleteLeakPhotosIfUnreferenced,
  deletePhotoIfUnreferenced,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "./leakLifecycle";

const NOW = Date.parse("2026-07-15T08:00:00.000Z");

describe("leakLifecycle", () => {
  it("resolves a leak with one consistent timestamp and auditable changes", () => {
    const updated = resolveLeakRecord(
      { id: 1, status: "in_progress", note: "old", history: [] },
      { photo_after: "idb://after", note: "fixed" },
      { user: "Operator", now: NOW },
    );

    expect(updated).toMatchObject({
      status: "resolved",
      updatedAt: NOW,
      note: "fixed",
    });
    // Вехи не пишутся: и момент, и снимок теперь лежат в событии, а поле
    // гасится — у записи, заведённой до переезда, оно осталось бы лежать.
    expect(updated.resolvedAt).toBeUndefined();
    expect(updated.photo_after).toBeNull();
    expect(getRepairDoneAt(updated)).toBe("2026-07-15T08:00:00.000Z");
    expect(getRepairDonePhoto(updated)).toBe("idb://after");
    expect(updated.history.at(-1)).toMatchObject({
      action: "status_changed",
      to: "resolved",
      date: "2026-07-15T08:00:00.000Z",
      user: "Operator",
    });
    expect(updated.history.at(-1).changes.map((change) => change.key)).toEqual([
      "note",
    ]);
  });

  it("starts repair from open and clears stale resolved state", () => {
    const updated = startLeakRepair(
      {
        id: 1,
        status: "open",
        photo: "idb://before",
        photo_after: "idb://after",
      },
      { photo_repair: "idb://repair" },
      { user: "Operator", now: NOW },
    );

    expect(updated).toMatchObject({
      status: "in_progress",
      photo: "idb://before",
      // Прошлое устранение перестало быть текущим, а свои вехи ремонт больше
      // не пишет: момент и снимок легли в событие.
      photo_after: null,
      resolvedAt: null,
    });
    expect(updated.repairAt).toBeUndefined();
    expect(updated.photo_repair).toBeNull();
    expect(getRepairStartedAt(updated)).toBe("2026-07-15T08:00:00.000Z");
    expect(getRepairPhoto(updated)).toBe("idb://repair");
    // Снимок в журнал изменений не заносится: он лежит в событии, и запись
    // «photo_repair изменился» повторяла бы его, ничего не добавляя.
    expect(updated.history.at(-1).changes).toBeUndefined();
  });

  it("keeps both repairs of a leak that came back", () => {
    // Вехи это теряли: второй ремонт затирал `repairAt` и `photo_repair`
    // первого, и вопрос «этот ремонт помог?» отвечать было нечем.
    const detected = { id: 3, status: "open", history: [] };
    const firstRepair = startLeakRepair(
      detected,
      { photo_repair: "idb://repair-1" },
      { user: "Operator", now: NOW },
    );
    const firstDone = resolveLeakRecord(
      firstRepair,
      { photo_after: "idb://after-1" },
      { user: "Operator", now: NOW + 1000 },
    );
    const reopened = changeLeakStatus(firstDone, "open", {
      user: "Operator",
      now: NOW + 2000,
    });
    const secondRepair = startLeakRepair(
      reopened,
      { photo_repair: "idb://repair-2" },
      { user: "Operator", now: NOW + 3000 },
    );
    const secondDone = resolveLeakRecord(
      secondRepair,
      { photo_after: "idb://after-2" },
      { user: "Operator", now: NOW + 4000 },
    );

    expect(secondDone.events.map((event) => event.type)).toEqual([
      "repair_started",
      "repair_done",
      "repair_started",
      "repair_done",
    ]);
    expect(secondDone.events.map((event) => event.photo)).toEqual([
      "idb://repair-1",
      "idb://after-1",
      "idb://repair-2",
      "idb://after-2",
    ]);
    // Возврат в работу события не оставляет: он уже виден следующим ремонтом.
    expect(reopened.events).toHaveLength(2);
    // Вех на записи нет вовсе: единственный ответ про починку даёт лента.
    expect(secondDone.photo_repair).toBeNull();
    expect(getRepairPhoto(secondDone)).toBe("idb://repair-2");
    expect(collectLeakPhotoPaths(secondDone)).toEqual(
      expect.arrayContaining(["idb://repair-1", "idb://after-1"]),
    );
  });

  it("rejects status skips inside the domain API", () => {
    expect(() =>
      resolveLeakRecord({ id: 1, status: "open" }, {}, { now: NOW }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_LEAK_STATUS_TRANSITION" }),
    );
    expect(() =>
      startLeakRepair({ id: 1, status: "resolved" }, {}, { now: NOW }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_LEAK_STATUS_TRANSITION" }),
    );
  });

  it("does not delete a photo that is reused as the after photo", () => {
    expect(
      getOrphanedOriginalPhoto({
        status: "resolved",
        photo: "idb://same",
        photo_after: "idb://same",
      }),
    ).toBeNull();
  });

  it("changes status and collects every unique photo including monitoring", () => {
    const updated = changeLeakStatus(
      { id: 1, status: "open", history: [] },
      "in_progress",
      { user: "Operator", now: NOW },
    );
    expect(updated.updatedAt).toBe(NOW);
    expect(
      collectLeakPhotoPaths({
        photo: "idb://before",
        photo_after: "idb://after",
        photo_repair: "idb://repair",
        monitoringRecords: [
          {
            photo: "idb://monitoring",
            previousPhoto: "idb://previous-monitoring",
          },
          { photo: "idb://before" },
        ],
      }),
    ).toEqual([
      "idb://before",
      "idb://after",
      "idb://repair",
      "idb://monitoring",
      "idb://previous-monitoring",
    ]);
  });

  it("does not delete a photo still referenced by monitoring history", async () => {
    const deleted = [];
    const deletePhoto = async (path) => deleted.push(path);
    const leak = {
      photo_after: "idb://new",
      monitoringRecords: [{ previousPhoto: "idb://old" }],
    };

    await expect(
      deletePhotoIfUnreferenced("idb://old", leak, deletePhoto),
    ).resolves.toBe(false);
    await expect(
      deletePhotoIfUnreferenced("idb://unused", leak, deletePhoto),
    ).resolves.toBe(true);
    expect(deleted).toEqual(["idb://unused"]);
  });

  it.each([
    [
      "status change",
      () => changeLeakStatus({ status: "open" }, "in_progress"),
    ],
    [
      "resolve",
      () => resolveLeakRecord({ status: "in_progress" }, {}, { now: NOW }),
    ],
    ["repair", () => startLeakRepair({ status: "open" }, {}, { now: NOW })],
  ])("requires a history user for %s", (_label, action) => {
    expect(action).toThrowError(
      expect.objectContaining({ code: "HISTORY_USER_REQUIRED" }),
    );
  });

  it("deletes only photo paths no longer referenced by other leaks", async () => {
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const removed = {
      photo: "idb://shared",
      photo_after: "idb://unique",
      monitoringRecords: [
        {
          photo: "idb://monitoring-shared",
          previousPhoto: "idb://previous-shared",
        },
      ],
    };
    const remaining = [
      { photo_repair: "idb://shared" },
      {
        monitoringRecords: [
          {
            photo: "idb://monitoring-shared",
            previousPhoto: "idb://previous-shared",
          },
        ],
      },
    ];

    await expect(
      deleteLeakPhotosIfUnreferenced(removed, remaining, deletePhoto),
    ).resolves.toEqual(["idb://unique"]);
    expect(deletePhoto).toHaveBeenCalledOnce();
    expect(deletePhoto).toHaveBeenCalledWith("idb://unique");
  });
});
