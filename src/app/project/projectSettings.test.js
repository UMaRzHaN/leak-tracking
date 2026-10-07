import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeProjectSettings,
  readProjectSettings,
  shouldApplyIncomingProjectSettings,
  touchProjectSettings,
  writeProjectSettings,
} from "./projectSettings";

describe("projectSettings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("normalizes settings and rejects protected photo fields", () => {
    expect(
      normalizeProjectSettings({
        hiddenFields: ["component", "photo", "photo_after", "component", 42],
        excelMonitoringExportMode: "unknown",
        photoRequirements: {
          leakPhotoRequired: false,
          monitoringPhotoRequired: "no",
        },
        updatedAt: "broken",
      }),
    ).toEqual({
      hiddenFields: ["component"],
      excelMonitoringExportMode: "full",
      photoRequirements: {
        leakPhotoRequired: false,
        monitoringPhotoRequired: true,
        componentPhotoRequired: true,
        repairPhotoRequired: true,
      },
      voiceCorrections: [],
      allowNewRounds: true,
      allowFinishRounds: true,
      allowMergeRounds: true,
      reconcile: { allowNew: true, allowFinish: true, allowMerge: true },
      repairs: { allowNew: true, allowFinish: true, allowMerge: true },
      updatedAt: 0,
    });
  });

  it("reads legacy photo requirements and writes the complete current format", () => {
    localStorage.setItem(
      "app:legacy:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    localStorage.setItem(
      "app:legacy:hidden_fields_v1",
      JSON.stringify(["component", "photo"]),
    );
    localStorage.setItem("app:legacy:excel_export_mode_v1", "latest_per_round");
    localStorage.setItem("app:legacy:settings_updated_at_v1", "50");

    const legacy = readProjectSettings("legacy");
    expect(legacy).toEqual({
      hiddenFields: ["component"],
      excelMonitoringExportMode: "latest_per_round",
      photoRequirements: {
        leakPhotoRequired: true,
        monitoringPhotoRequired: false,
        componentPhotoRequired: true,
        repairPhotoRequired: true,
      },
      voiceCorrections: [],
      allowNewRounds: true,
      allowFinishRounds: true,
      allowMergeRounds: true,
      reconcile: { allowNew: true, allowFinish: true, allowMerge: true },
      repairs: { allowNew: true, allowFinish: true, allowMerge: true },
      updatedAt: 50,
    });

    writeProjectSettings("restored", legacy);
    expect(readProjectSettings("restored")).toEqual(legacy);
    expect(
      localStorage.getItem("app:restored:monitoring_settings_v1"),
    ).toBeNull();
  });

  it("advances timestamps monotonically even when the clock does not move", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    localStorage.setItem("app:project:settings_updated_at_v1", "100");

    expect(touchProjectSettings("project")).toBe(101);
    expect(touchProjectSettings("project")).toBe(102);
  });

  it("uses the newest settings and resolves timestamp ties deterministically", () => {
    const local = normalizeProjectSettings({
      hiddenFields: ["component"],
      voiceCorrections: [],
      updatedAt: 100,
    });
    const newer = normalizeProjectSettings({
      hiddenFields: ["note"],
      voiceCorrections: [],
      updatedAt: 200,
    });

    expect(shouldApplyIncomingProjectSettings(local, newer)).toBe(true);
    expect(shouldApplyIncomingProjectSettings(newer, local)).toBe(false);

    const tiedA = { ...local, updatedAt: 0 };
    const tiedB = { ...newer, updatedAt: 0 };
    const aAcceptsB = shouldApplyIncomingProjectSettings(tiedA, tiedB);
    const bAcceptsA = shouldApplyIncomingProjectSettings(tiedB, tiedA);
    expect(aAcceptsB).not.toBe(bAcceptsA);
  });
});

describe("allowNewRounds", () => {
  it("allows new rounds by default and remembers when they are locked", async () => {
    const { readAllowNewRounds, writeAllowNewRounds, readProjectSettings } =
      await import("./projectSettings");
    localStorage.clear();
    expect(readAllowNewRounds("p1")).toBe(true);
    writeAllowNewRounds("p1", false);
    expect(readAllowNewRounds("p1")).toBe(false);
    expect(readProjectSettings("p1").updatedAt).toBeGreaterThan(0);
    writeAllowNewRounds("p1", true);
    expect(readAllowNewRounds("p1")).toBe(true);
  });
});

describe("allowFinishRounds", () => {
  it("allows finishing by default, locks it apart from new rounds", async () => {
    const {
      readAllowFinishRounds,
      writeAllowFinishRounds,
      readAllowNewRounds,
      readProjectSettings,
      writeProjectSettings,
    } = await import("./projectSettings");
    localStorage.clear();
    expect(readAllowFinishRounds("p1")).toBe(true);
    writeAllowFinishRounds("p1", false);
    expect(readAllowFinishRounds("p1")).toBe(false);
    expect(readAllowNewRounds("p1")).toBe(true);

    // Доезжает с бэкапом и синхронизацией вместе с остальными настройками.
    const settings = readProjectSettings("p1");
    expect(settings.allowFinishRounds).toBe(false);
    writeProjectSettings("p2", settings);
    expect(readAllowFinishRounds("p2")).toBe(false);
  });
});

describe("allowMergeRounds", () => {
  it("allows merging by default and locks it on its own", async () => {
    const {
      readAllowMergeRounds,
      writeAllowMergeRounds,
      readAllowFinishRounds,
      readProjectSettings,
      writeProjectSettings,
    } = await import("./projectSettings");
    localStorage.clear();
    expect(readAllowMergeRounds("p1")).toBe(true);
    writeAllowMergeRounds("p1", false);
    expect(readAllowMergeRounds("p1")).toBe(false);
    expect(readAllowFinishRounds("p1")).toBe(true);

    writeProjectSettings("p2", readProjectSettings("p1"));
    expect(readAllowMergeRounds("p2")).toBe(false);
  });
});

describe("reconcile settings", () => {
  it("allows everything by default and keeps each permission apart", async () => {
    const {
      readRoundPermissions,
      writeRoundPermissions,
      readAllowNewRounds,
      readProjectSettings,
      writeProjectSettings,
    } = await import("./projectSettings");
    localStorage.clear();
    expect(readRoundPermissions("p1", "reconcile")).toEqual({
      allowNew: true,
      allowFinish: true,
      allowMerge: true,
    });
    writeRoundPermissions("p1", "reconcile", { allowMerge: false });
    expect(readRoundPermissions("p1", "repairs").allowMerge).toBe(true);
    expect(readRoundPermissions("p1", "reconcile")).toEqual({
      allowNew: true,
      allowFinish: true,
      allowMerge: false,
    });
    // Разрешения сверки не трогают обходы мониторинга.
    expect(readAllowNewRounds("p1")).toBe(true);

    writeProjectSettings("p2", readProjectSettings("p1"));
    expect(readRoundPermissions("p2", "reconcile").allowMerge).toBe(false);
  });
});
