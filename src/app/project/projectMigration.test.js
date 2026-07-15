import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "./storageKeys";
import { migrateFromLegacy } from "./projectMigration";

const MIGRATION_DONE_KEY = "app:legacy_migrated_v1";

describe("migrateFromLegacy", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists a legacy project before removing its original payload", () => {
    localStorage.setItem(
      STORAGE_KEYS._LEGACY_PROJECT_CONFIG,
      JSON.stringify({
        type: "upstream",
        name: "North Field",
        configuredAt: 1234,
      }),
    );

    const result = migrateFromLegacy([]);

    expect(result).toEqual([
      {
        id: "1234",
        name: "North Field",
        type: "upstream",
        folderName: "North_Field",
        createdAt: 1234,
      },
    ]);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)),
    ).toEqual(result);
    expect(
      localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG),
    ).toBeNull();
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBe("1");
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

  it("does not touch storage when projects already exist", () => {
    const existing = [{ id: "current" }];
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    expect(migrateFromLegacy(existing)).toBe(existing);
    expect(getItem).not.toHaveBeenCalled();
  });
});
