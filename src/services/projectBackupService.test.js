import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildProjectBackupZip,
  importProjectZip,
  mergeLeaksByFreshness,
} from "./projectBackupService";

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
});
