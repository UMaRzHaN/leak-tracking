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
    expect(ctx.saveRef.current).toHaveBeenCalledWith([currentLeak]);
    getAllSpy.mockRestore();
  });
});
