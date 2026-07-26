import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  applyProjectTombstones,
  clearProjectSyncState,
  getLeakSyncFreshness,
  getLeakSyncIdentity,
  getLeakSyncIdentities,
  getLeakMergeIdentity,
  markProjectVarsUpdated,
  mergeProjectSyncStates,
  normalizeProjectSyncState,
  readProjectSyncState,
  readProjectSyncStateAsync,
  recordLeakDeletions,
  writeProjectSyncState,
} from "./projectSyncState";

describe("projectSyncState", () => {
  afterEach(() => localStorage.clear());

  it("records deletions and prevents an older snapshot from resurrecting a leak", async () => {
    const removed = { id: "leak-1", updatedAt: 100 };
    await recordLeakDeletions("project-1", [removed], [], 200);

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

  it("prefers internal id and uses the tag only for legacy records", () => {
    expect(getLeakSyncIdentity({ id: "internal", leak_id: 42 })).toBe(
      "id:internal",
    );
    expect(getLeakSyncIdentity({ id: "internal" })).toBe("id:internal");
    expect(getLeakSyncIdentity({ id: "internal", leak_id: "   " })).toBe(
      "id:internal",
    );
    expect(getLeakSyncIdentity({ leak_id: " TAG-1 " })).toBe("tag:TAG-1");
    expect(getLeakSyncIdentity({})).toBeNull();
    expect(getLeakSyncIdentity(null)).toBeNull();
    expect(getLeakMergeIdentity({ id: "internal", leak_id: " TAG-1 " })).toBe(
      "tag:TAG-1",
    );
  });

  it("keeps legacy tag tombstones effective for records that now have ids", () => {
    const leak = { id: "internal", leak_id: "TAG-1", updatedAt: 100 };

    expect(getLeakSyncIdentities(leak)).toEqual(["id:internal", "tag:TAG-1"]);
    expect(
      applyProjectTombstones([leak], { deleted: { "tag:TAG-1": 200 } }),
    ).toEqual([]);
    expect(
      applyProjectTombstones([{ ...leak, updatedAt: 250 }], {
        deleted: { "tag:TAG-1": 200 },
      }),
    ).toHaveLength(1);
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

  it("uses field-level clocks when comparing an edit with a tombstone", () => {
    const edited = {
      id: "leak-1",
      updatedAt: 100,
      status: "resolved",
      _fieldUpdatedAt: { status: 250 },
    };

    expect(getLeakSyncFreshness(edited)).toBe(250);
    expect(
      applyProjectTombstones([edited], { deleted: { "id:leak-1": 200 } }),
    ).toEqual([edited]);
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

  it("records only identities removed from the next live snapshot", async () => {
    await recordLeakDeletions(
      "project-1",
      [{ id: "kept", updatedAt: 100 }, { id: "removed", updatedAt: 100 }, {}],
      [{ id: "kept", updatedAt: 150 }],
      500,
    );

    expect(readProjectSyncState("project-1").deleted).toEqual({
      "id:removed": 500,
    });
    await recordLeakDeletions(null, [{ id: "ignored" }], [], 600);
  });

  it("records both id and tag tombstones and recognizes a matching tag", async () => {
    const previous = { id: "device-a-id", leak_id: "TAG-7", updatedAt: 100 };

    await recordLeakDeletions("project-1", [previous], [], 500);
    expect(readProjectSyncState("project-1").deleted).toEqual({
      "id:device-a-id": 500,
      "tag:TAG-7": 500,
    });

    localStorage.clear();
    await recordLeakDeletions(
      "project-1",
      [previous],
      [{ id: "device-b-id", leak_id: "TAG-7", updatedAt: 200 }],
      600,
    );
    expect(readProjectSyncState("project-1").deleted).toEqual({});
  });

  it("does not discard old tombstones after twenty thousand deletions", () => {
    const deleted = Object.fromEntries(
      Array.from({ length: 20_001 }, (_, index) => [
        "id:leak-" + index,
        index + 1,
      ]),
    );

    writeProjectSyncState("project-1", { deleted });

    const stored = readProjectSyncState("project-1").deleted;
    expect(Object.keys(stored)).toHaveLength(20_001);
    expect(stored["id:leak-0"]).toBe(1);
  });

  it("falls back to IndexedDB when localStorage quota is exceeded", async () => {
    globalThis.indexedDB = new IDBFactory();
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (String(key).includes("sync_state_v1")) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      });

    await writeProjectSyncState("quota-project", {
      deleted: { "id:durable": 900 },
    });
    setItem.mockRestore();
    localStorage.clear();

    expect((await readProjectSyncStateAsync("quota-project")).deleted).toEqual({
      "id:durable": 900,
    });

    await clearProjectSyncState("quota-project");
    expect((await readProjectSyncStateAsync("quota-project")).deleted).toEqual(
      {},
    );
    delete globalThis.indexedDB;
  });
  it("merges durable tombstones before recording a deletion after restart", async () => {
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
    const initial = await import("./projectSyncState");
    await initial.writeProjectSyncState("restart-project", {
      deleted: { "id:durable": 700 },
    });
    localStorage.setItem(
      "app:restart-project:sync_state_v1",
      JSON.stringify({ deleted: { "id:stale-cache": 500 } }),
    );

    vi.resetModules();
    const reloaded = await import("./projectSyncState");
    await reloaded.recordLeakDeletions(
      "restart-project",
      [{ id: "new-deletion" }],
      [],
      900,
    );

    expect(
      (await reloaded.readProjectSyncStateAsync("restart-project")).deleted,
    ).toEqual({
      "id:durable": 700,
      "id:stale-cache": 500,
      "id:new-deletion": 900,
    });
    await reloaded.clearProjectSyncState("restart-project");
    delete globalThis.indexedDB;
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

  it("clears a stale variable timestamp when replacing sync state", () => {
    writeProjectSyncState("project-1", { varsUpdatedAt: 500 });
    expect(localStorage.getItem("app:project-1:vars_updated_at_v1")).toBe(
      "500",
    );

    writeProjectSyncState("project-1", { varsUpdatedAt: 0 });

    expect(localStorage.getItem("app:project-1:vars_updated_at_v1")).toBeNull();
    expect(readProjectSyncState("project-1").varsUpdatedAt).toBe(0);
  });
});
