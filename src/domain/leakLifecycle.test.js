import { describe, expect, it, vi } from "vitest";
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
      resolvedAt: NOW,
      updatedAt: NOW,
      photo_after: "idb://after",
      note: "fixed",
    });
    expect(updated.history.at(-1)).toMatchObject({
      action: "status_changed",
      to: "resolved",
      date: "2026-07-15T08:00:00.000Z",
      user: "Operator",
    });
    expect(updated.history.at(-1).changes.map((change) => change.key)).toEqual(
      expect.arrayContaining(["note", "photo_after"]),
    );
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
      photo_after: null,
      photo_repair: "idb://repair",
      repairAt: NOW,
      resolvedAt: null,
    });
    expect(updated.history.at(-1).changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "photo_repair" }),
      ]),
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
          { photo: "idb://monitoring" },
          { photo: "idb://before" },
        ],
      }),
    ).toEqual([
      "idb://before",
      "idb://after",
      "idb://repair",
      "idb://monitoring",
    ]);
  });

  it("does not delete a photo still referenced by monitoring history", async () => {
    const deleted = [];
    const deletePhoto = async (path) => deleted.push(path);
    const leak = {
      photo_after: "idb://new",
      monitoringRecords: [{ photo: "idb://old" }],
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
      monitoringRecords: [{ photo: "idb://monitoring-shared" }],
    };
    const remaining = [
      { photo_repair: "idb://shared" },
      { monitoringRecords: [{ photo: "idb://monitoring-shared" }] },
    ];

    await expect(
      deleteLeakPhotosIfUnreferenced(removed, remaining, deletePhoto),
    ).resolves.toEqual(["idb://unique"]);
    expect(deletePhoto).toHaveBeenCalledOnce();
    expect(deletePhoto).toHaveBeenCalledWith("idb://unique");
  });
});
