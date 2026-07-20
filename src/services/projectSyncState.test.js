import { afterEach, describe, expect, it } from "vitest";
import {
  applyProjectTombstones,
  getLeakSyncFreshness,
  getLeakSyncIdentity,
  markProjectVarsUpdated,
  mergeProjectSyncStates,
  normalizeProjectSyncState,
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

  it("prefers tag identity and falls back to internal id", () => {
    expect(getLeakSyncIdentity({ id: "internal", leak_id: 42 })).toBe("tag:42");
    expect(getLeakSyncIdentity({ id: "internal" })).toBe("id:internal");
    expect(getLeakSyncIdentity({ id: "internal", leak_id: "   " })).toBe(
      "id:internal",
    );
    expect(getLeakSyncIdentity({ id: "internal", leak_id: " TAG-1 " })).toBe(
      "tag:TAG-1",
    );
    expect(getLeakSyncIdentity({})).toBeNull();
    expect(getLeakSyncIdentity(null)).toBeNull();
  });

  it("uses the freshest lifecycle, history, or monitoring timestamp", () => {
    const leak = {
      createdAt: 100,
      updatedAt: 200,
      resolvedAt: 150,
      history: [{ date: "2026-01-01T00:00:00.000Z" }, { date: "invalid" }],
      monitoringRecords: [{ date: "2026-02-01T00:00:00.000Z" }],
    };

    expect(getLeakSyncFreshness(leak)).toBe(
      Date.parse("2026-02-01T00:00:00.000Z"),
    );
    expect(getLeakSyncFreshness(null)).toBe(0);
  });

  it("normalizes malformed deletion and vars state", () => {
    expect(
      normalizeProjectSyncState({
        version: 99,
        varsUpdatedAt: "2026-01-01T00:00:00.000Z",
        deleted: {
          "id:valid": "2026-02-01T00:00:00.000Z",
          "id:invalid": "bad",
          "": 100,
        },
      }),
    ).toEqual({
      version: 1,
      varsUpdatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
      deleted: {
        "id:valid": Date.parse("2026-02-01T00:00:00.000Z"),
      },
    });
    expect(normalizeProjectSyncState({ deleted: [] }).deleted).toEqual({});
  });

  it("recovers from corrupted storage and merges the legacy vars timestamp", () => {
    localStorage.setItem("app:project-1:sync_state_v1", "{broken");
    expect(readProjectSyncState("project-1")).toEqual({
      version: 1,
      deleted: {},
      varsUpdatedAt: 0,
    });

    localStorage.setItem(
      "app:project-1:sync_state_v1",
      JSON.stringify({ varsUpdatedAt: 100 }),
    );
    localStorage.setItem("app:project-1:vars_updated_at_v1", "200");
    expect(readProjectSyncState("project-1").varsUpdatedAt).toBe(200);
    expect(readProjectSyncState(null).varsUpdatedAt).toBe(0);
  });

  it("merges tombstones and variable timestamps by maximum freshness", () => {
    expect(
      mergeProjectSyncStates(
        { varsUpdatedAt: 100, deleted: { "id:one": 200 } },
        {
          varsUpdatedAt: 300,
          deleted: { "id:one": 250, "id:two": 150 },
        },
      ),
    ).toEqual({
      version: 1,
      varsUpdatedAt: 300,
      deleted: { "id:one": 250, "id:two": 150 },
    });
  });

  it("records only identities removed from the next live snapshot", () => {
    recordLeakDeletions(
      "project-1",
      [{ id: "kept", updatedAt: 100 }, { id: "removed", updatedAt: 100 }, {}],
      [{ id: "kept", updatedAt: 150 }],
      500,
    );

    expect(readProjectSyncState("project-1").deleted).toEqual({
      "id:removed": 500,
    });
    recordLeakDeletions(null, [{ id: "ignored" }], [], 600);
  });

  it("marks project variables with monotonically increasing timestamps", () => {
    markProjectVarsUpdated("project-1", 300);
    markProjectVarsUpdated("project-1", 200);

    expect(readProjectSyncState("project-1").varsUpdatedAt).toBe(300);
    expect(localStorage.getItem("app:project-1:vars_updated_at_v1")).toBe(
      "300",
    );
    markProjectVarsUpdated(null, 400);
  });
});
