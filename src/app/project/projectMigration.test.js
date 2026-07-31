import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "./storageKeys";
import { migrateFromLegacy } from "./projectMigration";

const MIGRATION_DONE_KEY = "app:legacy_migrated_v1";
const LEGACY_PAYLOAD_MIGRATION_DONE_KEY = "app:legacy_payload_migrated_v2";

describe("migrateFromLegacy", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists a legacy project before removing its original payload", () => {
    const legacyData = JSON.stringify([{ id: "legacy-1", status: "open" }]);
    const legacySettings = JSON.stringify({ density: 0.0007 });
    localStorage.setItem(
      STORAGE_KEYS._LEGACY_PROJECT_CONFIG,
      JSON.stringify({
        type: "upstream",
        name: "North Field",
        configuredAt: 1234,
      }),
    );
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA("upstream"), legacyData);
    localStorage.setItem(
      STORAGE_KEYS._LEGACY_PROJECT_SETTINGS("upstream"),
      legacySettings,
    );

    const result = migrateFromLegacy([]);

    expect(result).toEqual([
      {
        id: "1234",
        name: "North Field",
        type: "upstream",
        folderName: "upstream",
        createdAt: 1234,
        legacyStorageType: "upstream",
      },
    ]);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)),
    ).toEqual(result);
    expect(
      localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG),
    ).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("1234"))).toBe(
      legacyData,
    );
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_VARS("1234"))).toBe(
      legacySettings,
    );
    // Source payloads remain as recovery copies.
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("upstream"))).toBe(
      legacyData,
    );
    expect(
      localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_SETTINGS("upstream")),
    ).toBe(legacySettings);
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBe("1");
    expect(localStorage.getItem(LEGACY_PAYLOAD_MIGRATION_DONE_KEY)).toBe("1");
  });

  it("uses the newest available legacy database key and supports older keys", () => {
    localStorage.setItem(
      STORAGE_KEYS._LEGACY_PROJECT_CONFIG,
      JSON.stringify({
        type: "midstream",
        name: "Pipeline",
        configuredAt: 42,
      }),
    );
    localStorage.setItem(
      "leaks_database:midstream:v1",
      JSON.stringify([{ id: "older", status: "open" }]),
    );
    localStorage.setItem(
      "leaks_database_v1",
      JSON.stringify([{ id: "oldest", status: "open" }]),
    );

    migrateFromLegacy([]);

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("42"))),
    ).toEqual([{ id: "older", status: "open" }]);
  });

  it("recovers the actual single-project active key when no config exists", () => {
    vi.spyOn(Date, "now").mockReturnValue(2026);
    const legacyData = JSON.stringify([{ id: "active", status: "open" }]);
    localStorage.setItem(STORAGE_KEYS._LEGACY_ACTIVE_PROJECT, "downstream");
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA("downstream"), legacyData);

    const result = migrateFromLegacy([]);

    expect(result).toEqual([
      {
        id: "2026",
        name: "Downstream",
        type: "downstream",
        folderName: "downstream",
        createdAt: 2026,
        legacyStorageType: "downstream",
      },
    ]);
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("2026"))).toBe(
      legacyData,
    );
    expect(localStorage.getItem(STORAGE_KEYS._LEGACY_ACTIVE_PROJECT)).toBe(
      "downstream",
    );
  });

  it("keeps the legacy payload when saving the new project list fails", () => {
    const legacy = JSON.stringify({ type: "midstream", name: "Pipeline" });
    localStorage.setItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG, legacy);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      function (key, value) {
        if (key === STORAGE_KEYS.PROJECTS_LIST)
          throw new Error("quota exceeded");
        return originalSetItem.call(this, key, value);
      },
    );

    expect(migrateFromLegacy([])).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG)).toBe(
      legacy,
    );
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBeNull();
  });

  it("leaves malformed legacy data available for a later recovery", () => {
    localStorage.setItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG, "{broken");

    expect(migrateFromLegacy([])).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG)).toBe(
      "{broken",
    );
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBeNull();
  });

  it("does not publish a project or lose a malformed legacy database", () => {
    const config = JSON.stringify({
      type: "downstream",
      name: "Refinery",
      configuredAt: 91,
    });
    localStorage.setItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG, config);
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA("downstream"), "{broken");

    expect(migrateFromLegacy([])).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("91"))).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("downstream"))).toBe(
      "{broken",
    );
    expect(localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG)).toBe(
      config,
    );
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_PAYLOAD_MIGRATION_DONE_KEY)).toBeNull();
  });

  it("rolls back copied payloads when publishing the project list fails", () => {
    const legacyData = JSON.stringify([{ id: "safe", status: "open" }]);
    localStorage.setItem(
      STORAGE_KEYS._LEGACY_PROJECT_CONFIG,
      JSON.stringify({
        type: "upstream",
        name: "Field",
        configuredAt: 77,
      }),
    );
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA("upstream"), legacyData);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      function (key, value) {
        if (key === STORAGE_KEYS.PROJECTS_LIST) {
          throw new Error("quota exceeded");
        }
        return originalSetItem.call(this, key, value);
      },
    );

    expect(migrateFromLegacy([])).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("77"))).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("upstream"))).toBe(
      legacyData,
    );
    expect(
      localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG),
    ).not.toBeNull();
  });

  it("repairs payloads for a project migrated by the old incomplete code", () => {
    const existing = [
      {
        id: "1234",
        name: "North Field",
        type: "upstream",
        folderName: "North_Field",
        createdAt: 1234,
      },
    ];
    const legacyData = JSON.stringify([{ id: "restored", status: "open" }]);
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA("upstream"), legacyData);

    const result = migrateFromLegacy(existing);

    expect(result).toEqual([{ ...existing[0], legacyStorageType: "upstream" }]);
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("1234"))).toBe(
      legacyData,
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)),
    ).toEqual(result);
    expect(localStorage.getItem(LEGACY_PAYLOAD_MIGRATION_DONE_KEY)).toBe("1");
  });

  it("never overwrites data already saved under the migrated project id", () => {
    const existing = [
      {
        id: "1234",
        name: "North Field",
        type: "upstream",
        folderName: "North_Field",
        createdAt: 1234,
      },
    ];
    const currentData = JSON.stringify([{ id: "current", status: "open" }]);
    localStorage.setItem(STORAGE_KEYS.PROJECT_DATA("1234"), currentData);
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_DATA("upstream"),
      JSON.stringify([{ id: "legacy", status: "open" }]),
    );

    migrateFromLegacy(existing);

    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_DATA("1234"))).toBe(
      currentData,
    );
  });

  it("does not touch storage when projects already exist", () => {
    const existing = [{ id: "current" }];
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    expect(migrateFromLegacy(existing)).toBe(existing);
    expect(getItem).not.toHaveBeenCalled();
  });
});
