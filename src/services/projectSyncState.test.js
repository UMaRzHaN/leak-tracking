import { afterEach, describe, expect, it } from "vitest";
import {
  applyProjectTombstones,
  mergeProjectSyncStates,
  readProjectSyncState,
  recordLeakDeletions,
  writeProjectSyncState,
} from "./projectSyncState";

describe("projectSyncState", () => {
  afterEach(() => localStorage.clear());

  it("records deletions and prevents an older snapshot from resurrecting a leak", () => {
    const removed = { id: "leak-1", updatedAt: 100 };
    recordLeakDeletions("project-1", [removed], [], 200);

    const state = readProjectSyncState("project-1");
    expect(state.deleted["id:leak-1"]).toBe(200);
    expect(applyProjectTombstones([removed], state)).toEqual([]);
  });

  it("allows a record changed after deletion to be restored and prunes its tombstone", () => {
    const state = mergeProjectSyncStates(
      { deleted: { "id:leak-1": 200 } },
      { deleted: { "id:leak-2": 300 } },
    );
    const restored = { id: "leak-1", updatedAt: 250 };

    expect(applyProjectTombstones([restored], state)).toEqual([restored]);
    writeProjectSyncState("project-1", state, [restored]);

    expect(readProjectSyncState("project-1").deleted).toEqual({
      "id:leak-2": 300,
    });
  });
});
