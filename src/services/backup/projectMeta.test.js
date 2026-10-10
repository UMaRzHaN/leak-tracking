import { afterEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  buildProjectMeta,
  normalizeImportedVars,
  normalizeProjectMeta,
  readStoredProjectVars,
  recalculateLeaks,
  resolveMonitoringRound,
} from "./projectMeta";

describe("projectMeta", () => {
  afterEach(() => localStorage.clear());

  it("builds nothing without a project and drops empty sections", () => {
    expect(buildProjectMeta()).toBeNull();
    const meta = buildProjectMeta({
      project: { name: "П", type: "upstream", folderName: "П", syncId: "s" },
      acceptances: [],
      survey: { slice: "category", groups: [{ name: "x" }] },
    });
    expect(meta).toMatchObject({
      schemaVersion: 5,
      project: { name: "П", type: "upstream", folderName: "П", syncId: "s" },
      survey: { slice: "category" },
    });
    expect(meta.acceptances).toBeUndefined();
    expect(meta.vars).toBeUndefined();
    expect(meta.rounds).toBeUndefined();
  });

  it("names any pink-bag spelling the same and keeps other vars", () => {
    expect(normalizeImportedVars(null)).toBeNull();
    expect(
      normalizeImportedVars({ equipmentType: " розовый мешок ", gasType: "x" }),
    ).toEqual({ equipmentType: "Розовый мешок", gasType: "x" });
    expect(normalizeImportedVars({ equipmentType: "Hi Flow" })).toEqual({
      equipmentType: "Hi Flow",
    });
  });

  it("normalizes only the sections a meta carries", () => {
    expect(normalizeProjectMeta(null)).toBeNull();
    expect(normalizeProjectMeta({ schemaVersion: 5 })).toEqual({
      schemaVersion: 5,
    });
    const meta = normalizeProjectMeta({
      vars: { equipmentType: "розовый мешок" },
      settings: {},
    });
    expect(meta.vars.equipmentType).toBe("Розовый мешок");
    expect(meta.settings).toHaveProperty("hiddenFields");
  });

  it("reads stored vars and survives a broken record", () => {
    expect(readStoredProjectVars("p1")).toBeNull();
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_VARS("p1"),
      JSON.stringify({ equipmentType: "розовый мешок" }),
    );
    expect(readStoredProjectVars("p1")).toEqual({
      equipmentType: "Розовый мешок",
    });
    localStorage.setItem(STORAGE_KEYS.PROJECT_VARS("p1"), "{");
    expect(readStoredProjectVars("p1")).toBeNull();
  });

  it("recalculates leaks only when vars arrived", () => {
    const leaks = [{ id: 1, flowRate: "2" }];
    expect(recalculateLeaks(leaks, null)).toBe(leaks);
    const recalculated = recalculateLeaks(leaks, { gasType: "methane" });
    expect(recalculated).not.toBe(leaks);
    expect(recalculated[0]).toMatchObject({ id: 1 });
  });

  it("still exports the round rule for older importers", () => {
    const round = { id: "r", number: 2 };
    expect(resolveMonitoringRound(null, round)).toBe(round);
  });
});
