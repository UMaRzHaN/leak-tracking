import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildProjectBackupZip,
  importBackupZip,
  importIntoExistingProject,
  importProjectZip,
  mergeLeaksByFreshness,
  previewMergeLeaks,
} from "./projectBackupService";
import { LeakRepository } from "@/repositories/LeakRepository";

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
}));

const PROJECT = {
  id: "project-legacy",
  name: "Legacy",
  type: "upstream",
  folderName: "legacy",
};

function makeCtx(project = PROJECT) {
  const ctx = {
    addProject: vi.fn(() => {
      ctx.activeProjectIdRef.current = project.id;
      return project;
    }),
    removeProject: vi.fn(),
    savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
    saveRef: { current: vi.fn().mockResolvedValue(undefined) },
    activeProjectIdRef: { current: null },
    photoReadyRef: { current: true },
  };
  return ctx;
}

describe("projectBackupService legacy imports", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes legacy vars and recalculates imported emissions", async () => {
    const legacyVars = {
      density: 0.0007168,
      uncertainty: 0.05,
      percentage_gas_to_flare: 0,
      percentage_gas_to_utilization: 100,
      GWP: 28,
    };
    const legacyLeaks = [
      {
        id: "legacy-calc",
        lat: 55,
        lng: 73,
        status: "open",
        leak_speed: 5,
        Total_Annual_Methane_Loss_m3_y: 2.626686,
        Emissions_t_CO2eq_year: 0.05,
      },
    ];
    const zip = await buildProjectBackupZip({
      leaks: legacyLeaks,
      idbGet: null,
      project: PROJECT,
      vars: legacyVars,
    });
    const ctx = makeCtx();

    await importProjectZip(zip, ctx);

    const storedVars = JSON.parse(
      localStorage.getItem(`app:${PROJECT.id}:vars_v1`),
    );
    expect(storedVars.density).toBeCloseTo(0.7168);
    expect(storedVars.uncertainty).toBeCloseTo(5);

    const [savedLeaks] = ctx.saveRef.current.mock.calls[0];
    expect(savedLeaks[0].Total_Annual_Methane_Loss_m3_y).toBeCloseTo(2496.6);
    expect(savedLeaks[0].Emissions_t_CO2eq_year).toBeCloseTo(50.10776064);
  });

  it("exports and restores the active monitoring round", async () => {
    const round = {
      id: "round-4",
      number: 4,
      startedAt: "2026-07-14T05:00:00.000Z",
    };
    localStorage.setItem(
      `app:${PROJECT.id}:monitoring_round_v2`,
      JSON.stringify(round),
    );
    const zip = await buildProjectBackupZip({
      leaks: [],
      idbGet: null,
      project: PROJECT,
      vars: {},
    });
    localStorage.clear();
    const ctx = makeCtx();

    await importProjectZip(zip, ctx);

    expect(
      JSON.parse(localStorage.getItem(`app:${PROJECT.id}:monitoring_round_v2`)),
    ).toEqual(round);
  });

  it("keeps the pink bag calculation method for legacy equipment names", async () => {
    const legacyVars = {
      equipmentType: "pink bag",
      density: 0.0007168,
      uncertainty: 0.1,
      percentage_gas_to_flare: 0,
      percentage_gas_to_utilization: 100,
      gasPercentage: 50,
      GWP: 28,
    };
    const legacyLeaks = [
      {
        id: "legacy-pink",
        status: "open",
        leak_speed: 10,
        pressure: 0.2,
        temperature: 20,
      },
    ];
    const zip = await buildProjectBackupZip({
      leaks: legacyLeaks,
      idbGet: null,
      project: PROJECT,
      vars: legacyVars,
    });
    const ctx = makeCtx();

    await importProjectZip(zip, ctx);

    const storedVars = JSON.parse(
      localStorage.getItem(`app:${PROJECT.id}:vars_v1`),
    );
    expect(storedVars.equipmentType).toBe("Розовый мешок");
    expect(storedVars.uncertainty).toBeCloseTo(10);

    const [savedLeaks] = ctx.saveRef.current.mock.calls[0];
    expect(savedLeaks[0].equipmentType).toBe("Розовый мешок");
    expect(savedLeaks[0].Total_Annual_Methane_Loss_m3_y).not.toBeCloseTo(
      (10 * 1440 * 365 * 0.9) / 1000,
    );
  });

  it("restores legacy inline data URI photos through photo storage", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "backup.json",
      JSON.stringify([
        {
          id: "legacy-photo",
          status: "open",
          photo: "data:image/png;base64,ZmFrZQ==",
        },
      ]),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const savePhoto = vi
      .fn()
      .mockResolvedValue("idb://photo_project_legacy-photo_100");

    const result = await importBackupZip(blob, savePhoto);

    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(savePhoto.mock.calls[0][1]).toBe("legacy-photo");
    expect(result.leaks[0].photo).toBe("idb://photo_project_legacy-photo_100");
  });

  it("exports and restores monitoring photos from a ZIP backup", async () => {
    const tinyPng = "data:image/png;base64,ZmFrZQ==";
    const leak = {
      id: "leak-with-monitoring",
      leak_id: "1001",
      status: "open",
      monitoringRecords: [
        {
          id: "round-1",
          date: "2026-07-14T09:00:00.000Z",
          photo: tinyPng,
          result: "still_leaking",
        },
      ],
    };
    const blob = await buildProjectBackupZip({
      leaks: [leak],
      idbGet: null,
      project: PROJECT,
      vars: null,
    });
    const savePhoto = vi
      .fn()
      .mockResolvedValue("idb://photo_project_1001_monitoring_round-1_100");

    const result = await importBackupZip(blob, savePhoto);

    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(savePhoto.mock.calls[0][1]).toBe("1001_monitoring_round-1");
    expect(result.leaks[0].monitoringRecords[0].photo).toBe(
      "idb://photo_project_1001_monitoring_round-1_100",
    );
  });
});

describe("mergeLeaksByFreshness", () => {
  it("uses the archive leak when its log is newer than the local leak", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      status: "open",
      leak_speed: 1,
      photo: "idb://photo_project_same-leak_100",
      updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
      history: [{ action: "created", date: "2026-01-01T00:00:00.000Z" }],
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      status: "resolved",
      leak_speed: 5,
      photo: "zip:photos/7/before.jpg",
      history: [
        { action: "created", date: "2026-01-01T00:00:00.000Z" },
        { action: "status_changed", date: "2026-02-01T00:00:00.000Z" },
      ],
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0]).toMatchObject({
      status: "resolved",
      leak_speed: 5,
      photo: "idb://photo_project_same-leak_100",
    });
  });

  it("keeps restored archive photos when the archive photo was saved successfully", () => {
    const local = {
      id: "same-leak",
      photo: "idb://photo_project_same-leak_old",
      updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    };
    const incoming = {
      id: "same-leak",
      photo: "idb://photo_project_same-leak_new",
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.updated).toBe(1);
    expect(result.leaks[0].photo).toBe("idb://photo_project_same-leak_new");
  });

  it("merges fresh incoming fields without clearing local values with empty import fields", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      status: "open",
      component: "Valve",
      note: "Keep this note",
      updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      status: "resolved",
      component: "",
      note: "",
      leak_speed: 5,
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.updated).toBe(1);
    expect(result.changedFields).toBeGreaterThanOrEqual(2);
    expect(result.leaks[0]).toMatchObject({
      status: "resolved",
      component: "Valve",
      note: "Keep this note",
      leak_speed: 5,
    });
  });

  it("adds a history log entry with changed fields after excel merge", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      status: "open",
      leak_speed: 1,
      updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
      history: [{ action: "created", date: "2026-01-01T00:00:00.000Z" }],
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      status: "resolved",
      leak_speed: 5,
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const result = mergeLeaksByFreshness([local], [incoming], {
      source: "excel",
    });

    const historyEntry = result.leaks[0].history.at(-1);
    expect(historyEntry).toMatchObject({
      action: "edited",
      text: "Обновлено при импорте Excel",
    });
    expect(historyEntry.changes).toEqual(
      expect.arrayContaining([
        { key: "status", from: "open", to: "resolved" },
        { key: "leak_speed", from: 1, to: 5 },
      ]),
    );
  });

  it("applies excel field changes and logs them even when the local record has a newer timestamp", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      status: "open",
      leak_speed: 1,
      updatedAt: Date.parse("2026-03-01T00:00:00.000Z"),
      history: [{ action: "created", date: "2026-03-01T00:00:00.000Z" }],
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      status: "resolved",
      leak_speed: 5,
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const zipResult = mergeLeaksByFreshness([local], [incoming]);
    expect(zipResult.changed).toBe(0);
    expect(zipResult.leaks[0].status).toBe("open");

    const excelPreview = previewMergeLeaks([local], [incoming], {
      source: "excel",
    });
    expect(excelPreview.updated).toBe(1);
    expect(excelPreview.changedFields).toBeGreaterThanOrEqual(2);

    const excelResult = mergeLeaksByFreshness([local], [incoming], {
      source: "excel",
    });
    expect(excelResult.updated).toBe(1);
    expect(excelResult.leaks[0]).toMatchObject({
      status: "resolved",
      leak_speed: 5,
    });
    expect(excelResult.leaks[0].history.at(-1)).toMatchObject({
      action: "edited",
      text: "Обновлено при импорте Excel",
    });
  });

  it("merges monitoring records instead of replacing local monitoring history", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
      monitoringRecords: [
        {
          id: "old-check",
          date: "2026-01-10T10:00:00.000Z",
          result: "still_leaking",
        },
      ],
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
      monitoringRecords: [
        {
          id: "new-check",
          date: "2026-02-10T10:00:00.000Z",
          result: "resolved",
        },
      ],
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.updated).toBe(1);
    expect(result.leaks[0].monitoringRecords).toEqual([
      {
        id: "old-check",
        date: "2026-01-10T10:00:00.000Z",
        result: "still_leaking",
      },
      {
        id: "new-check",
        date: "2026-02-10T10:00:00.000Z",
        result: "resolved",
      },
    ]);
  });

  it("keeps the local leak when it is newer than the archive leak", () => {
    const local = {
      id: "same-leak",
      status: "in_progress",
      leak_speed: 3,
      updatedAt: Date.parse("2026-03-01T00:00:00.000Z"),
    };
    const incoming = {
      id: "same-leak",
      status: "open",
      leak_speed: 1,
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.changed).toBe(0);
    expect(result.leaks[0]).toMatchObject({
      status: "in_progress",
      leak_speed: 3,
    });
  });

  it("keeps missing local photos empty when the archive leak is older", () => {
    const local = {
      id: "same-leak",
      status: "in_progress",
      photo: null,
      photo_after: null,
      updatedAt: Date.parse("2026-03-01T00:00:00.000Z"),
    };
    const incoming = {
      id: "same-leak",
      status: "open",
      photo: "idb://photo_project_same-leak_before",
      photo_after: "idb://photo_project_same-leak_after",
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.changed).toBe(0);
    expect(result.leaks[0]).toMatchObject({
      status: "in_progress",
      photo: null,
      photo_after: null,
    });
  });

  it("does not replace existing local photos from an older archive leak", () => {
    const local = {
      id: "same-leak",
      photo: "idb://photo_project_same-leak_local",
      updatedAt: Date.parse("2026-03-01T00:00:00.000Z"),
    };
    const incoming = {
      id: "same-leak",
      photo: "idb://photo_project_same-leak_archive",
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.changed).toBe(0);
    expect(result.leaks[0].photo).toBe("idb://photo_project_same-leak_local");
  });

  it("counts monitoring photos in merge preview", () => {
    const result = previewMergeLeaks(
      [],
      [
        {
          id: "incoming",
          photo: "zip:photos/incoming/before.jpg",
          monitoringRecords: [
            { id: "m1", photo: "zip:photos/incoming/monitoring_m1.jpg" },
            { id: "m2", photo: "data:image/png;base64,ZmFrZQ==" },
          ],
        },
      ],
    );

    expect(result.archivePhotos).toBe(3);
    expect(result.photoStats).toMatchObject({
      added: 3,
      replaced: 0,
      reused: 0,
    });
  });

  it("splits archive photos into new, replacement, and already existing", () => {
    const current = {
      id: "same-leak",
      photo: "idb://before",
      monitoringRecords: [{ id: "m1", photo: "idb://monitoring" }],
      updatedAt: Date.parse("2026-03-10T00:00:00.000Z"),
    };
    const incoming = {
      id: "same-leak",
      photo: "zip:photos/before.jpg",
      photo_after: "zip:photos/after.jpg",
      monitoringRecords: [{ id: "m1", photo: "zip:photos/monitoring.jpg" }],
      updatedAt: Date.parse("2026-03-09T00:00:00.000Z"),
    };

    const skipped = previewMergeLeaks([current], [incoming]);
    expect(skipped.photoStats).toMatchObject({
      added: 0,
      replaced: 0,
      reused: 2,
    });

    const updated = previewMergeLeaks(
      [current],
      [{ ...incoming, updatedAt: Date.parse("2026-03-11T00:00:00.000Z") }],
    );
    expect(updated.photoStats).toMatchObject({
      added: 1,
      replaced: 2,
      reused: 0,
    });
  });

  it("counts changed fields in merge preview", () => {
    const result = previewMergeLeaks(
      [
        {
          id: "same-leak",
          leak_id: 7,
          status: "open",
          updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
        },
      ],
      [
        {
          id: "same-leak",
          leak_id: 7,
          status: "resolved",
          leak_speed: 5,
          updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
        },
      ],
    );

    expect(result.updated).toBe(1);
    expect(result.changedFields).toBeGreaterThanOrEqual(2);
  });

  it("ignores Excel-only rounding differences in calculated fields", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      leak_speed: 2,
      leak_speed_kg_h: 119.999999,
      Total_Annual_Methane_Loss_t_y: 63.071999,
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      leak_speed: 2,
      leak_speed_kg_h: 120,
      Total_Annual_Methane_Loss_t_y: 63.072,
    };

    const result = previewMergeLeaks([local], [incoming], {
      source: "excel",
    });

    expect(result).toMatchObject({ updated: 0, skipped: 1, changedFields: 0 });
  });

  it("treats equivalent Excel numbers and calendar dates as unchanged", () => {
    const result = previewMergeLeaks(
      [
        {
          id: "same-leak",
          leak_id: 7,
          pressure: "12.5",
          resolvedAt: Date.parse("2026-03-16T14:25:00.000Z"),
        },
      ],
      [
        {
          id: "same-leak",
          leak_id: 7,
          pressure: 12.5,
          resolvedAt: "16.03.2026",
          repairAt: "15.03.2026",
        },
      ],
      { source: "excel" },
    );

    expect(result).toMatchObject({ updated: 0, skipped: 1, changedFields: 0 });
  });

  it("ignores regenerated Excel identities for unchanged monitoring records", () => {
    const date = "2026-03-10T00:00:00.000Z";
    const local = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "local-monitoring-id",
          roundId: "local-round-id",
          date: Date.parse(date),
          result: "still_leaking",
          comment: "Без изменений",
          photo: "idb://same-photo",
        },
      ],
    };
    const incoming = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "excel-7-round-1-2",
          roundId: "excel-round-1",
          roundNumber: 1,
          date,
          result: "still_leaking",
          monitoredBy: "",
          materials_equipment: "",
          comment: "Без изменений",
          photo: "idb://same-photo",
        },
      ],
    };

    const result = previewMergeLeaks([local], [incoming], {
      source: "excel",
    });

    expect(result).toMatchObject({ updated: 0, skipped: 1, changedFields: 0 });
  });

  it("does not restore older archive photos during merge into an existing project", async () => {
    const existingProject = {
      id: "project-current",
      folderName: "current",
      name: "Current",
      type: "upstream",
    };
    const currentLeak = {
      id: "same-leak",
      status: "in_progress",
      photo: "idb://photo_project_same-leak_local",
      updatedAt: Date.parse("2026-03-01T00:00:00.000Z"),
    };
    const archiveLeak = {
      id: "same-leak",
      status: "open",
      photo: "data:image/png;base64,ZmFrZQ==",
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify([archiveLeak]));
    const blob = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi
      .spyOn(LeakRepository, "getAll")
      .mockResolvedValue([currentLeak]);
    const saveAllSpy = vi
      .spyOn(LeakRepository, "saveAll")
      .mockResolvedValue(undefined);
    const ctx = {
      overwriteProject: vi.fn((id) => {
        ctx.activeProjectIdRef.current = id;
        return true;
      }),
      savePhotoRef: { current: vi.fn().mockResolvedValue("idb://archive") },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: null },
      photoReadyRef: { current: true },
      existingProject,
    };

    await importIntoExistingProject(blob, ctx, "merge");

    expect(ctx.savePhotoRef.current).not.toHaveBeenCalled();
    expect(ctx.saveRef.current).not.toHaveBeenCalled();
    expect(saveAllSpy).toHaveBeenCalledWith([currentLeak], {
      projectId: existingProject.id,
      folderName: existingProject.folderName,
    });
    expect(ctx.overwriteProject).toHaveBeenCalledWith(existingProject.id);
    getAllSpy.mockRestore();
    saveAllSpy.mockRestore();
  });

  it("does not switch projects when overwrite save fails", async () => {
    const existingProject = {
      id: "project-current",
      folderName: "current",
      name: "Current",
      type: "upstream",
    };
    const incomingLeak = {
      id: "incoming",
      leak_id: 9,
      status: "open",
      updatedAt: Date.parse("2026-02-01T00:00:00.000Z"),
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify([incomingLeak]));
    const blob = await zip.generateAsync({ type: "blob" });
    const saveAllSpy = vi
      .spyOn(LeakRepository, "saveAll")
      .mockRejectedValue(new Error("save failed"));
    const ctx = {
      overwriteProject: vi.fn((id) => {
        ctx.activeProjectIdRef.current = id;
        return true;
      }),
      savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: "other-project" },
      photoReadyRef: { current: true },
      existingProject,
    };

    await expect(
      importIntoExistingProject(blob, ctx, "overwrite"),
    ).rejects.toThrow("save failed");

    expect(ctx.overwriteProject).not.toHaveBeenCalled();
    expect(saveAllSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "incoming" })]),
      {
        projectId: existingProject.id,
        folderName: existingProject.folderName,
      },
    );
    saveAllSpy.mockRestore();
  });
});
