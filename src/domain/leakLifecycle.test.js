import { describe, expect, it } from "vitest";
import {
  changeLeakStatus,
  collectLeakPhotoPaths,
  getOrphanedOriginalPhoto,
  resolveLeakRecord,
  startLeakRepair,
} from "./leakLifecycle";

const NOW = Date.parse("2026-07-15T08:00:00.000Z");

describe("leakLifecycle", () => {
  it("resolves a leak with one consistent timestamp and auditable changes", () => {
    const updated = resolveLeakRecord(
      { id: 1, status: "open", note: "old", history: [] },
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

  it("moves the after photo to the primary slot when repair restarts", () => {
    const updated = startLeakRepair(
      {
        id: 1,
        status: "resolved",
        photo: "idb://before",
        photo_after: "idb://after",
      },
      { photo_repair: "idb://repair" },
      { now: NOW },
    );

    expect(updated).toMatchObject({
      status: "in_progress",
      photo: "idb://after",
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
      { now: NOW },
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
});
