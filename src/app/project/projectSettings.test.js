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
      },
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
      },
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
      updatedAt: 100,
    });
    const newer = normalizeProjectSettings({
      hiddenFields: ["note"],
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
