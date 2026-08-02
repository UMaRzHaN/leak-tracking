import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildProjectBackupZip,
  importBackupZip,
  importIntoExistingProject,
  importProjectZip,
  mergeLeaksByFreshness,
  previewMergeLeaks,
  streamProjectBackupZip,
} from "./projectBackupService";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  readProjectSyncState,
  writeProjectSyncState,
} from "@/services/projectSyncState";

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

function addProjectMeta(zip, project) {
  zip.file(
    "project.json",
    JSON.stringify({
      schemaVersion: 5,
      project: {
        name: project.name,
        type: project.type,
        folderName: project.folderName,
        syncId: project.syncId,
      },
    }),
  );
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

  it("limits concurrent photo restoration while importing an archive", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const leaks = Array.from({ length: 12 }, (_, index) => ({
      id: `photo-${index}`,
      status: "open",
      photo: "data:image/png;base64,ZmFrZQ==",
    }));
    zip.file("backup.json", JSON.stringify(leaks));
    const blob = await zip.generateAsync({ type: "blob" });
    let active = 0;
    let maxActive = 0;
    const savePhoto = vi.fn(async (_photo, key) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return `idb://${key}`;
    });

    const result = await importBackupZip(blob, savePhoto);

    expect(result.leaks).toHaveLength(12);
    expect(savePhoto).toHaveBeenCalledTimes(12);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
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
          previousPhoto: tinyPng,
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

    expect(savePhoto).toHaveBeenCalledTimes(2);
    expect(savePhoto.mock.calls[0][1]).toBe("1001_monitoring_round-1");
    expect(savePhoto.mock.calls[1][1]).toBe(
      "1001_monitoring_round-1_previousPhoto",
    );
    expect(result.leaks[0].monitoringRecords[0].photo).toBe(
      "idb://photo_project_1001_monitoring_round-1_100",
    );
    expect(result.leaks[0].monitoringRecords[0].previousPhoto).toBe(
      "idb://photo_project_1001_monitoring_round-1_100",
    );
  });

  it("keeps colliding leak photo folders isolated in a ZIP backup", async () => {
    const { default: JSZip } = await import("jszip");
    const blob = await buildProjectBackupZip({
      leaks: [
        {
          id: "first",
          leak_id: "A/B",
          photo: "data:image/png;base64,b25l",
          monitoringRecords: [
            { id: "m1", photo: "data:image/png;base64,b25lLW0=" },
          ],
        },
        {
          id: "second",
          leak_id: "A\\B",
          photo: "data:image/png;base64,dHdv",
          monitoringRecords: [
            { id: "m2", photo: "data:image/png;base64,dHdvLW0=" },
          ],
        },
      ],
      idbGet: null,
      project: PROJECT,
      vars: null,
    });

    const zip = await JSZip.loadAsync(blob);
    const backup = JSON.parse(await zip.file("backup.json").async("string"));

    expect(backup.map((leak) => leak.photo)).toEqual([
      "zip:photos/A-B/before.png",
      "zip:photos/A-B~second/before.png",
    ]);
    expect(backup.map((leak) => leak.monitoringRecords[0].photo)).toEqual([
      "zip:photos/A-B/monitoring/record-1.png",
      "zip:photos/A-B~second/monitoring/record-1.png",
    ]);
    expect(await zip.file("photos/A-B/before.png").async("string")).toBe("one");
    expect(await zip.file("photos/A-B~second/before.png").async("string")).toBe(
      "two",
    );
  });

  it("keeps recovery photos separate from active leak photos", async () => {
    const { default: JSZip } = await import("jszip");
    const blob = await buildProjectBackupZip({
      leaks: [
        {
          id: "main",
          leak_id: "TAG-1",
          photo: "data:image/png;base64,bWFpbg==",
        },
      ],
      recoveryRecords: [
        {
          id: "recovery",
          leak_id: "tag-1",
          photo: "data:image/png;base64,cmVjb3Zlcnk=",
        },
      ],
      idbGet: null,
      project: PROJECT,
      vars: null,
    });

    const zip = await JSZip.loadAsync(blob);
    const backup = JSON.parse(await zip.file("backup.json").async("string"));
    const recovery = JSON.parse(
      await zip.file("recovery-invalid-records.json").async("string"),
    );

    expect(backup[0].photo).toBe("zip:photos/TAG-1/before.png");
    expect(recovery[0].photo).toBe("zip:photos/tag-1~recovery/before.png");
    expect(await zip.file("photos/TAG-1/before.png").async("string")).toBe(
      "main",
    );
    expect(
      await zip.file("photos/tag-1~recovery/before.png").async("string"),
    ).toBe("recovery");
  });

  it("omits unreadable local photo references from a portable backup", async () => {
    const { default: JSZip } = await import("jszip");
    const blob = await buildProjectBackupZip({
      leaks: [
        {
          id: "missing-photos",
          photo: "idb://missing-before",
          photo_after: "data://LeakReports/missing/after.jpg",
          photo_repair: "",
          monitoringRecords: [
            { id: "m1", photo: "idb://missing-monitoring" },
            { id: "m2", photo: null },
          ],
        },
      ],
      idbGet: vi.fn().mockResolvedValue(null),
      project: PROJECT,
      vars: null,
    });

    const zip = await JSZip.loadAsync(blob);
    const backup = JSON.parse(await zip.file("backup.json").async("string"));
    expect(backup[0]).not.toHaveProperty("photo");
    expect(backup[0]).not.toHaveProperty("photo_after");
    expect(backup[0]).not.toHaveProperty("photo_repair");
    expect(backup[0].monitoringRecords[0]).not.toHaveProperty("photo");
    expect(backup[0].monitoringRecords[1].photo).toBeNull();

    await expect(importBackupZip(blob, vi.fn())).resolves.toMatchObject({
      leaks: [expect.objectContaining({ id: "missing-photos" })],
    });
  });

  it.each([
    {
      label: "leak",
      leak: {
        id: "broken-main-photo",
        photo: "zip:photos/leak-1/before.jpg",
      },
      missingPath: "photos/leak-1/before.jpg",
    },
    {
      label: "monitoring",
      leak: {
        id: "broken-monitoring-photo",
        monitoringRecords: [
          {
            id: "m1",
            photo: "zip:photos/leak-1/monitoring/monitoring_record-1.jpg",
          },
        ],
      },
      missingPath: "photos/leak-1/monitoring/monitoring_record-1.jpg",
    },
  ])(
    "rejects a backup before restoration when its $label ZIP photo is missing",
    async ({ leak, missingPath }) => {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("backup.json", JSON.stringify([leak]));
      const archive = await zip.generateAsync({ type: "blob" });
      const savePhoto = vi.fn();

      await expect(importBackupZip(archive, savePhoto)).rejects.toThrow(
        `Файл фото "${missingPath}" не найден`,
      );
      expect(savePhoto).not.toHaveBeenCalled();
    },
  );

  it("restores the previously active project when a new-project import rolls back", async () => {
    const archive = await buildProjectBackupZip({
      leaks: [{ id: "imported", status: "open" }],
      idbGet: null,
      project: PROJECT,
      vars: null,
    });
    const ctx = makeCtx();
    ctx.activeProjectIdRef.current = "project-second";
    ctx.removeProject.mockImplementation(() => {
      ctx.activeProjectIdRef.current = "project-first";
    });
    ctx.overwriteProject = vi.fn((projectId) => {
      ctx.activeProjectIdRef.current = projectId;
      return true;
    });
    ctx.saveRef.current.mockRejectedValueOnce(new Error("save failed"));

    await expect(importProjectZip(archive, ctx)).rejects.toThrow("save failed");

    expect(ctx.removeProject).toHaveBeenCalledWith(PROJECT.id);
    expect(ctx.overwriteProject).toHaveBeenCalledWith("project-second");
    expect(ctx.activeProjectIdRef.current).toBe("project-second");
  });
});

describe("streamProjectBackupZip", () => {
  it("streams real-sized photos into an import-compatible archive", async () => {
    const { default: JSZip } = await import("jszip");
    const chunks = [];
    const photo = new Blob([new Uint8Array(700_000)], { type: "image/jpeg" });

    await streamProjectBackupZip({
      leaks: [{ id: "streamed", leak_id: "LEAK-42", photo: "idb://photo-42" }],
      idbGet: vi.fn().mockResolvedValue(photo),
      project: PROJECT,
      vars: {},
      writeChunk: async (chunk) => chunks.push(chunk.slice()),
    });

    expect(
      Math.max(...chunks.map((chunk) => chunk.length)),
    ).toBeLessThanOrEqual(256 * 1024);
    const archiveBytes = new Uint8Array(
      chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    );
    let archiveOffset = 0;
    for (const chunk of chunks) {
      archiveBytes.set(chunk, archiveOffset);
      archiveOffset += chunk.length;
    }
    const zip = await JSZip.loadAsync(archiveBytes);
    const backup = JSON.parse(await zip.file("backup.json").async("string"));
    expect(backup[0].photo).toBe("zip:photos/LEAK-42/before.jpg");
    expect(
      await zip.file("photos/LEAK-42/before.jpg").async("uint8array"),
    ).toHaveLength(photo.size);
    expect(Object.keys(zip.files)).not.toContain("photos/../before.jpg");
    expect(zip.file("project.json")).not.toBeNull();
  });

  it("streams colliding leak ids into separate photo folders", async () => {
    const { default: JSZip } = await import("jszip");
    const chunks = [];
    const photos = new Map([
      ["first", new Blob(["first"], { type: "image/png" })],
      ["second", new Blob(["second"], { type: "image/png" })],
    ]);

    await streamProjectBackupZip({
      leaks: [
        { id: "first", leak_id: "TAG-1", photo: "idb://first" },
        { id: "second", leak_id: "tag-1", photo: "idb://second" },
      ],
      idbGet: vi.fn(async (id) => photos.get(id)),
      project: PROJECT,
      vars: {},
      writeChunk: async (chunk) => chunks.push(chunk.slice()),
    });

    const archive = new Blob(chunks, { type: "application/zip" });
    const zip = await JSZip.loadAsync(archive);
    const backup = JSON.parse(await zip.file("backup.json").async("string"));

    expect(backup.map((leak) => leak.photo)).toEqual([
      "zip:photos/TAG-1/before.png",
      "zip:photos/tag-1~second/before.png",
    ]);
    expect(await zip.file("photos/TAG-1/before.png").async("string")).toBe(
      "first",
    );
    expect(
      await zip.file("photos/tag-1~second/before.png").async("string"),
    ).toBe("second");
  });

  it("does not stream unreadable device-local photo paths into backup.json", async () => {
    const { default: JSZip } = await import("jszip");
    const chunks = [];

    await streamProjectBackupZip({
      leaks: [
        {
          id: "streamed-missing",
          photo: "idb://missing-before",
          photo_after: "data://LeakReports/missing/after.jpg",
          monitoringRecords: [
            { id: "m1", photo: "data://LeakReports/missing/monitoring.jpg" },
          ],
        },
      ],
      idbGet: vi.fn().mockResolvedValue(null),
      project: PROJECT,
      vars: {},
      writeChunk: async (chunk) => chunks.push(chunk.slice()),
    });

    const archive = new Blob(chunks, { type: "application/zip" });
    const zip = await JSZip.loadAsync(archive);
    const backup = JSON.parse(await zip.file("backup.json").async("string"));
    expect(backup[0]).not.toHaveProperty("photo");
    expect(backup[0]).not.toHaveProperty("photo_after");
    expect(backup[0].monitoringRecords[0]).not.toHaveProperty("photo");
    await expect(importBackupZip(archive, vi.fn())).resolves.toMatchObject({
      leaks: [expect.objectContaining({ id: "streamed-missing" })],
    });
  });
});
describe("mergeLeaksByFreshness", () => {
  it("matches archive leak tags case-insensitively", () => {
    const result = mergeLeaksByFreshness(
      [{ id: "local", leak_id: " TAG-1 ", status: "open", updatedAt: 1 }],
      [
        {
          id: "archive",
          leak_id: "tag-1",
          status: "resolved",
          updatedAt: 2,
        },
      ],
      { source: "archive" },
    );

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0]).toMatchObject({
      id: "local",
      status: "resolved",
    });
  });

  it("merges independent changes from two devices without dropping either leak", () => {
    const deviceA = [
      { id: "one", status: "resolved", updatedAt: 300 },
      { id: "two", status: "open", updatedAt: 100 },
    ];
    const deviceB = [
      { id: "one", status: "open", updatedAt: 100 },
      { id: "two", status: "in_progress", updatedAt: 400 },
    ];

    const result = mergeLeaksByFreshness(deviceA, deviceB);

    expect(result.leaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "one", status: "resolved" }),
        expect.objectContaining({ id: "two", status: "in_progress" }),
      ]),
    );
  });

  it("is idempotent when the same sync archive is imported twice", () => {
    const local = [{ id: "one", status: "open", updatedAt: 100 }];
    const incoming = [{ id: "one", status: "resolved", updatedAt: 200 }];

    const first = mergeLeaksByFreshness(local, incoming);
    const second = mergeLeaksByFreshness(first.leaks, incoming);

    expect(first.updated).toBe(1);
    expect(second.changed).toBe(0);
    expect(second.leaks).toEqual(first.leaks);
  });

  it("converges equal-freshness sync conflicts deterministically", () => {
    const deviceA = [
      {
        id: "shared",
        leak_id: "TAG-1",
        status: "open",
        component: "Valve",
      },
    ];
    const deviceB = [
      {
        id: "shared",
        leak_id: "TAG-1",
        status: "resolved",
        component: "Flange",
      },
    ];

    const onA = mergeLeaksByFreshness(deviceA, deviceB, { source: "sync" });
    const onB = mergeLeaksByFreshness(deviceB, deviceA, { source: "sync" });
    const comparable = (leak) => {
      const copy = { ...leak };
      delete copy.id;
      delete copy.index;
      return copy;
    };

    expect(comparable(onA.leaks[0])).toEqual(comparable(onB.leaks[0]));
    expect(onA.changed + onB.changed).toBe(2);
    expect(onA.leaks[0].history).toBeUndefined();
    expect(onB.leaks[0].history).toBeUndefined();
  });

  it("keeps one sync record when its editable leak tag changes", () => {
    const local = [
      {
        id: "shared",
        leak_id: "TAG-OLD",
        updatedAt: 100,
        _fieldUpdatedAt: { leak_id: 100 },
      },
    ];
    const incoming = [
      {
        id: "shared",
        leak_id: "TAG-NEW",
        updatedAt: 200,
        _fieldUpdatedAt: { leak_id: 200 },
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, { source: "sync" });

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0]).toMatchObject({
      id: "shared",
      leak_id: "TAG-NEW",
    });
    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);
  });

  it("uses the leak tag for ordinary merges but stable ids for sync", () => {
    const local = [
      {
        id: "local-id",
        leak_id: "TAG-1",
        status: "open",
        updatedAt: 100,
      },
    ];
    const incoming = [
      {
        id: "archive-id",
        leak_id: "TAG-1",
        status: "resolved",
        updatedAt: 200,
      },
    ];

    const ordinaryMerge = mergeLeaksByFreshness(local, incoming);
    const syncMerge = mergeLeaksByFreshness(local, incoming, {
      source: "sync",
    });
    const ordinaryPreview = previewMergeLeaks(local, incoming);

    expect(ordinaryMerge).toMatchObject({ added: 0, updated: 1 });
    expect(ordinaryMerge.leaks).toEqual([
      expect.objectContaining({
        id: "local-id",
        leak_id: "TAG-1",
        status: "resolved",
      }),
    ]);
    expect(ordinaryPreview).toMatchObject({ added: 0, updated: 1 });
    expect(syncMerge).toMatchObject({ added: 1, updated: 0 });
    expect(syncMerge.leaks).toHaveLength(2);
  });

  it("matches monitoring records by id after their local photo path changes", () => {
    const local = [
      {
        id: "shared",
        monitoringRecords: [
          {
            id: "monitoring-1",
            date: "2026-07-20T08:30:00.000Z",
            result: "still_leaking",
            photo: "idb://device-a-monitoring",
          },
        ],
      },
    ];
    const incoming = [
      {
        id: "shared",
        monitoringRecords: [
          {
            id: "monitoring-1",
            date: "2026-07-20T08:30:00.000Z",
            result: "still_leaking",
            photo: "idb://restored-device-b-monitoring",
          },
        ],
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, { source: "sync" });

    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0].monitoringRecords).toEqual([
      expect.objectContaining({
        id: "monitoring-1",
        photo: "idb://restored-device-b-monitoring",
      }),
    ]);
  });

  it("merges concurrent edits to different fields from two devices", () => {
    const fieldKey = "_fieldUpdatedAt";
    const deviceA = [
      {
        id: "one",
        status: "resolved",
        component: "Valve",
        updatedAt: 300,
        [fieldKey]: { status: 300, component: 100 },
      },
    ];
    const deviceB = [
      {
        id: "one",
        status: "open",
        component: "Flange",
        updatedAt: 400,
        [fieldKey]: { status: 100, component: 400 },
      },
    ];

    const onA = mergeLeaksByFreshness(deviceA, deviceB, { source: "sync" });
    const onB = mergeLeaksByFreshness(deviceB, deviceA, { source: "sync" });

    expect(onA.leaks[0]).toMatchObject({
      status: "resolved",
      component: "Flange",
    });
    expect(onB.leaks[0]).toMatchObject({
      status: "resolved",
      component: "Flange",
    });
    expect(onA.leaks[0][fieldKey]).toMatchObject({
      status: 300,
      component: 400,
    });
  });

  it("propagates a newer photo deletion without reviving the old file", () => {
    const local = [
      {
        id: "one",
        photo: "idb://old-photo",
        updatedAt: 100,
        _fieldUpdatedAt: { photo: 100 },
      },
    ];
    const incoming = [
      {
        id: "one",
        updatedAt: 200,
        _fieldUpdatedAt: { photo: 200 },
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, { source: "sync" });

    expect(result.leaks[0].photo).toBeUndefined();
    expect(result.leaks[0]._fieldUpdatedAt.photo).toBe(200);
  });

  it("ignores a stale photo deletion", () => {
    const local = [
      {
        id: "one",
        photo: "idb://new-photo",
        updatedAt: 200,
        _fieldUpdatedAt: { photo: 200 },
      },
    ];
    const incoming = [
      {
        id: "one",
        updatedAt: 100,
        _fieldUpdatedAt: { photo: 100 },
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, { source: "sync" });

    expect(result.changed).toBe(0);
    expect(result.leaks[0].photo).toBe("idb://new-photo");
  });
  it("merges independent archive field changes using field versions", () => {
    const local = [
      {
        id: "local-id",
        leak_id: "TAG-1",
        pressure: 12,
        comment: "Old comment",
        updatedAt: 400,
        _fieldUpdatedAt: { pressure: 400, comment: 100 },
      },
    ];
    const incoming = [
      {
        id: "archive-id",
        leak_id: "TAG-1",
        pressure: 10,
        comment: "Repair completed",
        updatedAt: 300,
        _fieldUpdatedAt: { pressure: 100, comment: 300 },
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, {
      source: "archive",
    });

    expect(result).toMatchObject({ added: 0, updated: 1 });
    expect(result.leaks[0]).toMatchObject({
      id: "local-id",
      leak_id: "TAG-1",
      pressure: 12,
      comment: "Repair completed",
      _fieldUpdatedAt: { pressure: 400, comment: 300 },
    });
  });

  it("merges archive photos independently and propagates a newer deletion", () => {
    const local = [
      {
        id: "local-id",
        leak_id: "TAG-1",
        photo: "idb://local-before",
        photo_after: "idb://local-after",
        _fieldUpdatedAt: { photo: 500, photo_after: 100 },
      },
    ];
    const incoming = [
      {
        id: "archive-id",
        leak_id: "TAG-1",
        photo_after: "idb://archive-after",
        _fieldUpdatedAt: { photo: 600, photo_after: 300 },
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, {
      source: "archive",
    });

    expect(result.leaks[0].photo).toBeUndefined();
    expect(result.leaks[0].photo_after).toBe("idb://archive-after");
    expect(result.leaks[0]._fieldUpdatedAt).toMatchObject({
      photo: 600,
      photo_after: 300,
    });
  });

  it("merges archive monitoring records while preserving independent records", () => {
    const local = [
      {
        id: "local-id",
        leak_id: "TAG-1",
        monitoringRecords: [
          {
            id: "m-local",
            date: "2026-07-30T08:00:00.000Z",
            result: "still_leaking",
            photo: "idb://local-monitoring",
          },
        ],
        _fieldUpdatedAt: { status: 100 },
      },
    ];
    const incoming = [
      {
        id: "archive-id",
        leak_id: "TAG-1",
        monitoringRecords: [
          {
            id: "m-archive",
            date: "2026-07-31T08:00:00.000Z",
            result: "resolved",
            photo: "idb://archive-monitoring",
          },
        ],
        _fieldUpdatedAt: { status: 200 },
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, {
      source: "archive",
    });

    expect(result.leaks[0].monitoringRecords).toEqual([
      expect.objectContaining({
        id: "m-local",
        photo: "idb://local-monitoring",
      }),
      expect.objectContaining({
        id: "m-archive",
        photo: "idb://archive-monitoring",
      }),
    ]);
  });

  it("keeps legacy archive merge semantics when field versions are absent", () => {
    const local = [
      {
        id: "local-id",
        leak_id: "TAG-1",
        pressure: 12,
        comment: "Keep me",
        updatedAt: 100,
      },
    ];
    const incoming = [
      {
        id: "archive-id",
        leak_id: "TAG-1",
        pressure: 15,
        comment: "",
        updatedAt: 200,
      },
    ];

    const result = mergeLeaksByFreshness(local, incoming, {
      source: "archive",
    });

    expect(result.leaks[0]).toMatchObject({ pressure: 15, comment: "Keep me" });
  });

  it("keeps blank leak tags distinct by their internal ids", () => {
    const existing = [
      { id: "one", leak_id: "", status: "open", updatedAt: 100 },
      { id: "two", leak_id: " ", status: "open", updatedAt: 100 },
    ];
    const incoming = [
      { id: "one", leak_id: "", status: "resolved", updatedAt: 200 },
    ];

    const result = mergeLeaksByFreshness(existing, incoming);

    expect(result.updated).toBe(1);
    expect(result.leaks.find((leak) => leak.id === "one")?.status).toBe(
      "resolved",
    );
    expect(result.leaks.find((leak) => leak.id === "two")?.status).toBe("open");
  });

  it("compares timestamp strings as numeric timestamps", () => {
    const local = {
      id: "same-leak",
      status: "open",
      updatedAt: "1700000000000",
    };
    const incoming = {
      id: "same-leak",
      status: "resolved",
      updatedAt: "1800000000000",
    };

    const result = mergeLeaksByFreshness([local], [incoming]);

    expect(result.updated).toBe(1);
    expect(result.leaks[0].status).toBe("resolved");
  });

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

  it("ignores legacy created_at differences during Excel re-import", () => {
    const result = previewMergeLeaks(
      [
        {
          id: "same-leak",
          leak_id: 7,
          created_at: "2026-03-16T14:25:00.000Z",
          status: "open",
        },
      ],
      [
        {
          id: "same-leak",
          leak_id: 7,
          created_at: "1773671100000",
          status: "open",
        },
      ],
      { source: "excel" },
    );

    expect(result).toMatchObject({ updated: 0, skipped: 1, changedFields: 0 });
  });

  it("ignores the technical Excel time column during re-import", () => {
    const result = previewMergeLeaks(
      [
        {
          id: "same-leak",
          leak_id: 7,
          status: "open",
          createdAt: new Date(2026, 6, 15, 16, 27, 43).getTime(),
        },
      ],
      [
        {
          id: "same-leak",
          leak_id: 7,
          status: "open",
          createdAt: new Date(2026, 6, 15, 16, 27, 43).getTime(),
          time: "16:27:43",
        },
      ],
      { source: "excel" },
    );

    expect(result).toMatchObject({
      updated: 0,
      skipped: 1,
      changedFields: 0,
      changedFieldBreakdown: {},
    });
  });

  it("matches an exported monitoring row after Excel drops its exact time", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "local-record",
          roundId: "round-3",
          roundNumber: 3,
          date: "2026-03-16T14:25:31.000Z",
          monitoredBy: "Inspector",
          result: "still_leaking",
          comment: "No change",
        },
      ],
    };
    const fromOwnExcel = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "excel-7-round-3-2",
          roundId: "excel-round-3",
          roundNumber: 3,
          date: "2026-03-16T00:00:00.000Z",
          monitoredBy: "Inspector",
          result: "still_leaking",
          materials_equipment: "",
          comment: "No change",
        },
      ],
    };

    const result = previewMergeLeaks([local], [fromOwnExcel], {
      source: "excel",
    });

    expect(result).toMatchObject({
      updated: 0,
      skipped: 1,
      changedFields: 0,
      changedFieldBreakdown: {},
    });
  });

  it("updates the exact timed monitoring row when a round has repeated checks", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "morning-record",
          roundNumber: 3,
          date: "2026-03-16T09:00:00.000Z",
          result: "still_leaking",
          comment: "Morning check",
        },
        {
          id: "afternoon-record",
          roundNumber: 3,
          date: "2026-03-16T15:00:00.000Z",
          result: "still_leaking",
          comment: "Afternoon check",
        },
      ],
    };
    const fromExcel = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "excel-record",
          roundNumber: 3,
          date: "2026-03-16T15:00:00.000Z",
          result: "resolved",
          comment: "Resolved in Excel",
        },
      ],
    };

    const result = mergeLeaksByFreshness([local], [fromExcel], {
      source: "excel",
    });

    expect(result.leaks[0].monitoringRecords).toHaveLength(2);
    expect(result.leaks[0].monitoringRecords[0]).toMatchObject({
      id: "morning-record",
      result: "still_leaking",
      comment: "Morning check",
    });
    expect(result.leaks[0].monitoringRecords[1]).toMatchObject({
      id: "afternoon-record",
      result: "resolved",
      comment: "Resolved in Excel",
    });
  });

  it("derives a blank Excel status from the latest merged monitoring record", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      status: "resolved",
      resolvedAt: "20.07.2026",
      monitoringRecords: [
        {
          date: "2026-07-20T10:00:00.000Z",
          roundNumber: 2,
          result: "resolved",
        },
      ],
    };
    const fromExcel = {
      id: "same-leak",
      leak_id: 7,
      status: "open",
      monitoringRecords: [
        {
          date: "2026-07-10T10:00:00.000Z",
          roundNumber: 1,
          result: "still_leaking",
        },
      ],
    };

    const result = mergeLeaksByFreshness([local], [fromExcel], {
      source: "excel",
      inferredStatusLeakIds: ["7"],
    });

    expect(result.leaks[0]).toMatchObject({
      status: "resolved",
      resolvedAt: "20.07.2026",
    });
    expect(result.leaks[0].monitoringRecords).toHaveLength(2);
    expect(result.leaks[0].monitoringRecords.at(-1).result).toBe("resolved");
  });

  it("clears resolvedAt when the latest merged monitoring result is open", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      status: "resolved",
      resolvedAt: "10.07.2026",
      monitoringRecords: [
        {
          date: "2026-07-10T10:00:00.000Z",
          roundNumber: 1,
          result: "resolved",
        },
      ],
    };
    const fromExcel = {
      id: "same-leak",
      leak_id: 7,
      status: "open",
      monitoringRecords: [
        {
          date: "2026-07-20T10:00:00.000Z",
          roundNumber: 2,
          result: "still_leaking",
        },
      ],
    };

    const result = mergeLeaksByFreshness([local], [fromExcel], {
      source: "excel",
      inferredStatusLeakIds: new Set(["7"]),
    });

    expect(result.leaks[0].status).toBe("open");
    expect(result.leaks[0]).not.toHaveProperty("resolvedAt");
  });

  it("applies edited monitoring fields when Excel lost the exact time", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "local-record",
          roundId: "round-3",
          roundNumber: 3,
          date: "2026-03-16T14:25:31.000Z",
          monitoredBy: "Inspector",
          result: "still_leaking",
          materials_equipment: "Old materials",
          comment: "Old comment",
        },
      ],
    };
    const fromExcel = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "excel-7-round-3-2",
          roundId: "excel-round-3",
          roundNumber: 3,
          date: "2026-03-16T00:00:00.000Z",
          monitoredBy: "Updated inspector",
          result: "resolved",
          materials_equipment: "New materials",
          comment: "Updated comment",
        },
      ],
    };

    const result = mergeLeaksByFreshness([local], [fromExcel], {
      source: "excel",
    });

    expect(result.updated).toBe(1);
    expect(result.leaks[0].monitoringRecords).toEqual([
      expect.objectContaining({
        id: "local-record",
        roundId: "round-3",
        date: "2026-03-16T14:25:31.000Z",
        monitoredBy: "Updated inspector",
        result: "resolved",
        materials_equipment: "New materials",
        comment: "Updated comment",
      }),
    ]);
  });
  it("applies edited monitoring fields when a photo identity matches an older Excel date", () => {
    const local = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "local-record",
          roundId: "round-3",
          roundNumber: 3,
          date: "2026-03-16T14:25:31.000Z",
          result: "still_leaking",
          comment: "Old comment",
          photo: "idb://monitoring-photo",
        },
      ],
    };
    const fromExcel = {
      id: "same-leak",
      leak_id: 7,
      monitoringRecords: [
        {
          id: "excel-7-round-3-2",
          roundId: "excel-round-3",
          roundNumber: 3,
          date: "2026-03-16T00:00:00.000Z",
          result: "resolved",
          comment: "Updated comment",
          photo: "idb://monitoring-photo",
        },
      ],
    };

    const result = mergeLeaksByFreshness([local], [fromExcel], {
      source: "excel",
    });

    expect(result.updated).toBe(1);
    expect(result.leaks[0].monitoringRecords).toEqual([
      expect.objectContaining({
        id: "local-record",
        roundId: "round-3",
        date: "2026-03-16T14:25:31.000Z",
        result: "resolved",
        comment: "Updated comment",
        photo: "idb://monitoring-photo",
      }),
    ]);
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
    addProjectMeta(zip, existingProject);
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

  it("stores restored photos under the target project when it is not active", async () => {
    const existingProject = {
      id: "target-project",
      folderName: "target-folder",
      name: "Target",
      type: "upstream",
    };
    const incomingLeak = {
      id: "incoming-with-photo",
      status: "open",
      photo: "data:image/png;base64,ZmFrZQ==",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify([incomingLeak]));
    addProjectMeta(zip, existingProject);
    const blob = await zip.generateAsync({ type: "blob" });
    const photoSaveSpy = vi
      .spyOn(PhotoRepository, "save")
      .mockResolvedValue("idb://target-photo");
    const saveAllSpy = vi
      .spyOn(LeakRepository, "saveAll")
      .mockResolvedValue(undefined);
    const gcSpy = vi
      .spyOn(PhotoRepository, "gcOrphaned")
      .mockResolvedValue(undefined);
    const ctx = {
      overwriteProject: vi.fn((id) => {
        ctx.activeProjectIdRef.current = id;
        return true;
      }),
      savePhotoRef: {
        current: vi.fn().mockResolvedValue("idb://wrong-active-project"),
      },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: "other-project" },
      photoReadyRef: { current: true },
      existingProject,
    };

    await importIntoExistingProject(blob, ctx, "overwrite");

    expect(photoSaveSpy).toHaveBeenCalledWith(
      expect.any(Blob),
      {
        projectId: existingProject.id,
        leakId: incomingLeak.id,
        folderName: existingProject.folderName,
      },
      [],
      expect.objectContaining({
        cleanupOldVersions: false,
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(ctx.savePhotoRef.current).not.toHaveBeenCalled();
    expect(saveAllSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ photo: "idb://target-photo" })],
      {
        projectId: existingProject.id,
        folderName: existingProject.folderName,
      },
    );
    expect(gcSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ photo: "idb://target-photo" })],
      {
        projectId: existingProject.id,
        folderName: existingProject.folderName,
      },
    );

    photoSaveSpy.mockRestore();
    saveAllSpy.mockRestore();
    gcSpy.mockRestore();
  });

  it("cleans partially restored photos when existing-project preparation fails", async () => {
    const existingProject = {
      id: "target-project",
      folderName: "target-folder",
      name: "Target",
      type: "upstream",
    };
    const existingLeaks = [{ id: "existing", status: "open" }];
    const incomingLeak = {
      id: "incoming-with-photos",
      status: "open",
      photo: "data:image/png;base64,Zmlyc3Q=",
      photo_after: "data:image/png;base64,c2Vjb25k",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify([incomingLeak]));
    addProjectMeta(zip, existingProject);
    const archive = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi
      .spyOn(LeakRepository, "getAll")
      .mockResolvedValue(existingLeaks);
    const photoSaveSpy = vi
      .spyOn(PhotoRepository, "save")
      .mockResolvedValueOnce("idb://first-restored")
      .mockRejectedValueOnce(new Error("second photo failed"));
    const gcSpy = vi
      .spyOn(PhotoRepository, "gcOrphaned")
      .mockResolvedValue(undefined);
    const ctx = {
      overwriteProject: vi.fn(),
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: existingProject.id },
      photoReadyRef: { current: true },
      existingProject,
    };

    await expect(
      importIntoExistingProject(archive, ctx, "overwrite"),
    ).rejects.toThrow("second photo failed");

    expect(ctx.saveRef.current).not.toHaveBeenCalled();
    expect(gcSpy).toHaveBeenCalledWith(existingLeaks, {
      projectId: existingProject.id,
      folderName: existingProject.folderName,
    });

    getAllSpy.mockRestore();
    photoSaveSpy.mockRestore();
    gcSpy.mockRestore();
  });

  it("clears stale project vars when an overwrite archive has no vars", async () => {
    const existingProject = {
      id: "project-with-stale-vars",
      folderName: "stale-vars",
      name: "Stale vars",
      type: "upstream",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "backup.json",
      JSON.stringify([{ id: "incoming", status: "open" }]),
    );
    addProjectMeta(zip, existingProject);
    const blob = await zip.generateAsync({ type: "blob" });
    localStorage.setItem(
      `app:${existingProject.id}:vars_v1`,
      JSON.stringify({ density: 9.9 }),
    );
    const getAllSpy = vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);
    const gcSpy = vi
      .spyOn(PhotoRepository, "gcOrphaned")
      .mockResolvedValue(undefined);
    const ctx = {
      overwriteProject: vi.fn(() => true),
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: existingProject.id },
      photoReadyRef: { current: true },
      existingProject,
    };

    await importIntoExistingProject(blob, ctx, "overwrite");

    expect(
      localStorage.getItem(`app:${existingProject.id}:vars_v1`),
    ).toBeNull();
    getAllSpy.mockRestore();
    gcSpy.mockRestore();
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
    addProjectMeta(zip, existingProject);
    const blob = await zip.generateAsync({ type: "blob" });
    const saveAllSpy = vi
      .spyOn(LeakRepository, "saveAll")
      .mockRejectedValue(new Error("save failed"));
    localStorage.setItem(
      `app:${existingProject.id}:vars_v1`,
      JSON.stringify({ density: 9.9 }),
    );
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
    expect(
      JSON.parse(localStorage.getItem(`app:${existingProject.id}:vars_v1`)),
    ).toEqual({ density: 9.9 });
    expect(saveAllSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "incoming" })]),
      {
        projectId: existingProject.id,
        folderName: existingProject.folderName,
      },
    );
    saveAllSpy.mockRestore();
  });

  it("applies sync tombstones, newer project vars, and the latest monitoring round", async () => {
    const existingProject = {
      id: "sync-project",
      folderName: "sync-project",
      name: "Sync Project",
      type: "upstream",
      syncId: "sync-project-1234",
    };
    const localLeak = { id: "removed-leak", status: "open", updatedAt: 100 };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify([localLeak]));
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          folderName: existingProject.folderName,
          syncId: existingProject.syncId,
        },
        vars: { density: 0.8 },
        monitoringRound: {
          id: "round-2",
          number: 2,
          startedAt: "2026-07-15T10:00:00.000Z",
        },
        sync: {
          version: 1,
          varsUpdatedAt: 200,
          deleted: { "id:removed-leak": 200 },
        },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi
      .spyOn(LeakRepository, "getAll")
      .mockResolvedValue([localLeak]);
    const ctx = {
      overwriteProject: vi.fn(() => true),
      setProjectSyncId: vi.fn(),
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: existingProject.id },
      photoReadyRef: { current: true },
      existingProject,
    };

    const result = await importIntoExistingProject(blob, ctx, "sync");

    expect(ctx.saveRef.current).toHaveBeenCalledWith([]);
    expect(result.leakCount).toBe(1);
    expect(
      JSON.parse(localStorage.getItem(`app:${existingProject.id}:vars_v1`))
        .density,
    ).toBeCloseTo(0.8);
    expect(
      JSON.parse(
        localStorage.getItem(`app:${existingProject.id}:monitoring_round_v2`),
      ).id,
    ).toBe("round-2");
    getAllSpy.mockRestore();
  });

  it.each(["merge", "overwrite", "sync"])(
    "rejects %s import when the archive project type differs",
    async (mode) => {
      const existingProject = {
        id: "typed-project",
        folderName: "typed-project",
        name: "Typed Project",
        type: "upstream",
        syncId: "typed-sync-1234",
      };
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("backup.json", "[]");
      zip.file(
        "project.json",
        JSON.stringify({
          schemaVersion: 4,
          project: {
            name: existingProject.name,
            type: "midstream",
            syncId: existingProject.syncId,
          },
        }),
      );
      const blob = await zip.generateAsync({ type: "blob" });

      const importPromise = importIntoExistingProject(
        blob,
        {
          existingProject,
          saveRef: { current: vi.fn() },
          activeProjectIdRef: { current: existingProject.id },
          photoReadyRef: { current: true },
          overwriteProject: vi.fn(),
          setProjectSyncId: vi.fn(),
        },
        mode,
      );

      await expect(importPromise).rejects.toMatchObject({
        code: "PROJECT_TYPE_MISMATCH",
        incomingProjectType: "midstream",
        existingProjectType: "upstream",
      });
      await expect(importPromise).rejects.toThrow(
        "Тип импортируемого проекта не соответствует текущему проекту",
      );
    },
  );

  it("rejects import into an existing project when the archive type is missing", async () => {
    const existingProject = {
      id: "typed-project",
      folderName: "typed-project",
      name: "Typed Project",
      type: "upstream",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", "[]");
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: { name: existingProject.name },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(
      importIntoExistingProject(
        blob,
        {
          existingProject,
          saveRef: { current: vi.fn() },
          activeProjectIdRef: { current: existingProject.id },
          photoReadyRef: { current: true },
          overwriteProject: vi.fn(),
        },
        "merge",
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_TYPE_MISSING",
      existingProjectType: "upstream",
    });
  });

  it("rejects synchronization between projects with different sync identifiers", async () => {
    const existingProject = {
      id: "sync-project",
      folderName: "sync-project",
      name: "Sync Project",
      type: "upstream",
      syncId: "sync-project-local",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", "[]");
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          syncId: "sync-project-remote",
        },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(
      importIntoExistingProject(
        blob,
        {
          existingProject,
          saveRef: { current: vi.fn() },
          activeProjectIdRef: { current: existingProject.id },
          photoReadyRef: { current: true },
        },
        "sync",
      ),
    ).rejects.toThrow("другой базы данных");
  });

  it("adopts the host sync identifier for a legacy project after first sync", async () => {
    const existingProject = {
      id: "legacy-sync-project",
      folderName: "legacy-sync-project",
      name: "Legacy Sync",
      type: "upstream",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", "[]");
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          syncId: "host-sync-1234",
        },
        sync: { version: 1, deleted: {}, varsUpdatedAt: 0 },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);
    const setProjectSyncId = vi.fn(() => ({
      ...existingProject,
      syncId: "host-sync-1234",
    }));

    const result = await importIntoExistingProject(
      blob,
      {
        existingProject,
        setProjectSyncId,
        saveRef: { current: vi.fn().mockResolvedValue(undefined) },
        activeProjectIdRef: { current: existingProject.id },
        photoReadyRef: { current: true },
      },
      "sync",
    );

    expect(setProjectSyncId).toHaveBeenCalledWith(
      existingProject.id,
      "host-sync-1234",
    );
    expect(result.project.syncId).toBe("host-sync-1234");
    getAllSpy.mockRestore();
  });

  it("replaces sync identity and generation during a full overwrite", async () => {
    const existingProject = {
      id: "overwrite-sync-generation",
      folderName: "overwrite-sync-generation",
      name: "Overwrite Sync",
      type: "upstream",
      syncId: "old-sync-1234",
    };
    await writeProjectSyncState(existingProject.id, {
      version: 2,
      generation: 1,
      epochId: "epoch-1-local",
      deleted: { local: 10 },
      varsUpdatedAt: 11,
    });

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", "[]");
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 5,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          syncId: "remote-sync-5678",
        },
        sync: {
          version: 2,
          generation: 3,
          epochId: "epoch-3-remote",
          deleted: { remote: 30 },
          varsUpdatedAt: 31,
        },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);
    const replaceProjectSyncId = vi.fn(() => ({
      ...existingProject,
      syncId: "remote-sync-5678",
    }));

    const result = await importIntoExistingProject(
      blob,
      {
        existingProject,
        replaceProjectSyncId,
        restoreProjectSnapshot: vi.fn(() => existingProject),
        saveRef: { current: vi.fn().mockResolvedValue(undefined) },
        activeProjectIdRef: { current: existingProject.id },
        photoReadyRef: { current: true },
      },
      "overwrite",
    );

    expect(replaceProjectSyncId).toHaveBeenCalledWith(
      existingProject.id,
      "remote-sync-5678",
    );
    expect(result.project.syncId).toBe("remote-sync-5678");
    expect(readProjectSyncState(existingProject.id)).toMatchObject({
      generation: 3,
      epochId: "epoch-3-remote",
      deleted: { remote: 30 },
      varsUpdatedAt: 31,
    });
    getAllSpy.mockRestore();
  });

  it("rolls back overwrite data and sync metadata when sync id replacement fails", async () => {
    const existingProject = {
      id: "overwrite-sync-rollback",
      folderName: "overwrite-sync-rollback",
      name: "Overwrite Sync Rollback",
      type: "upstream",
      syncId: "old-sync-rollback",
    };
    const existingLeaks = [{ id: "local", status: "open", updatedAt: 10 }];
    const incomingLeaks = [
      { id: "remote", status: "in_progress", updatedAt: 20 },
    ];
    await writeProjectSyncState(existingProject.id, {
      version: 2,
      generation: 1,
      epochId: "epoch-1-local-rollback",
      deleted: { local: 10 },
      varsUpdatedAt: 11,
    });

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify(incomingLeaks));
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 5,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          syncId: "remote-sync-rollback",
        },
        sync: {
          version: 2,
          generation: 4,
          epochId: "epoch-4-remote-rollback",
          deleted: { remote: 40 },
          varsUpdatedAt: 41,
        },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi
      .spyOn(LeakRepository, "getAll")
      .mockResolvedValue(existingLeaks);
    const saveRef = vi.fn().mockResolvedValue(undefined);
    const restoreProjectSnapshot = vi.fn(() => existingProject);

    await expect(
      importIntoExistingProject(
        blob,
        {
          existingProject,
          replaceProjectSyncId: vi.fn(() => null),
          restoreProjectSnapshot,
          saveRef: { current: saveRef },
          activeProjectIdRef: { current: existingProject.id },
          photoReadyRef: { current: true },
        },
        "overwrite",
      ),
    ).rejects.toThrow("Не удалось заменить идентификатор синхронизации");

    expect(saveRef).toHaveBeenCalledTimes(2);
    expect(saveRef).toHaveBeenLastCalledWith(existingLeaks);
    expect(restoreProjectSnapshot).toHaveBeenCalledWith(
      existingProject.id,
      existingProject,
    );
    expect(readProjectSyncState(existingProject.id)).toMatchObject({
      generation: 1,
      epochId: "epoch-1-local-rollback",
      deleted: { local: 10 },
      varsUpdatedAt: 11,
    });
    getAllSpy.mockRestore();
  });

  it("does not adopt a sync identifier when synchronization fails", async () => {
    const existingProject = {
      id: "legacy-sync-failure",
      folderName: "legacy-sync-failure",
      name: "Legacy Sync Failure",
      type: "upstream",
    };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", "[]");
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          syncId: "host-sync-failure",
        },
        sync: { version: 1, deleted: {}, varsUpdatedAt: 0 },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const setProjectSyncId = vi.fn();
    const getAllSpy = vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);

    await expect(
      importIntoExistingProject(
        blob,
        {
          existingProject,
          setProjectSyncId,
          saveRef: {
            current: vi.fn().mockRejectedValue(new Error("save failed")),
          },
          activeProjectIdRef: { current: existingProject.id },
          photoReadyRef: { current: true },
        },
        "sync",
      ),
    ).rejects.toThrow("save failed");

    expect(setProjectSyncId).not.toHaveBeenCalled();
    getAllSpy.mockRestore();
  });

  it("rolls back committed data when adopting the first sync id fails", async () => {
    const existingProject = {
      id: "legacy-sync-rollback",
      folderName: "legacy-sync-rollback",
      name: "Legacy Sync Rollback",
      type: "upstream",
    };
    const existingLeaks = [{ id: "local", status: "open", updatedAt: 10 }];
    const incomingLeaks = [
      { id: "remote", status: "in_progress", updatedAt: 20 },
    ];
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("backup.json", JSON.stringify(incomingLeaks));
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: {
          name: existingProject.name,
          type: existingProject.type,
          syncId: "host-sync-rollback",
        },
        sync: { version: 1, deleted: {}, varsUpdatedAt: 0 },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const getAllSpy = vi
      .spyOn(LeakRepository, "getAll")
      .mockResolvedValue(existingLeaks);
    const saveRef = vi.fn().mockResolvedValue(undefined);
    const restoreProjectSnapshot = vi.fn(() => existingProject);

    await expect(
      importIntoExistingProject(
        blob,
        {
          existingProject,
          setProjectSyncId: vi.fn(() => null),
          restoreProjectSnapshot,
          saveRef: { current: saveRef },
          activeProjectIdRef: { current: existingProject.id },
          photoReadyRef: { current: true },
        },
        "sync",
      ),
    ).rejects.toThrow("Не удалось сохранить идентификатор синхронизации");

    expect(saveRef).toHaveBeenCalledTimes(2);
    expect(saveRef).toHaveBeenLastCalledWith(existingLeaks);
    expect(restoreProjectSnapshot).toHaveBeenCalledWith(
      existingProject.id,
      existingProject,
    );
    getAllSpy.mockRestore();
  });

  it("merges the same monitoring record by field versions independently of import direction", () => {
    const a = {
      id: "same-leak",
      leak_id: "L-1",
      updatedAt: 500,
      _fieldUpdatedAt: { status: 500 },
      monitoringRecords: [
        {
          id: "m-1",
          date: "2026-07-01T10:00:00.000Z",
          result: "resolved",
          comment: "old",
          updatedAt: 500,
          _fieldUpdatedAt: { result: 500, comment: 100, date: 100 },
        },
      ],
    };
    const b = {
      id: "same-leak",
      leak_id: "L-1",
      updatedAt: 600,
      _fieldUpdatedAt: { status: 500 },
      monitoringRecords: [
        {
          id: "m-1",
          date: "2026-07-01T10:00:00.000Z",
          result: "still_leaking",
          comment: "fresh comment",
          updatedAt: 600,
          _fieldUpdatedAt: { result: 200, comment: 600, date: 100 },
        },
      ],
    };

    const ab = mergeLeaksByFreshness([a], [b], { source: "archive" }).leaks[0];
    const ba = mergeLeaksByFreshness([b], [a], { source: "archive" }).leaks[0];
    expect(ab.monitoringRecords[0]).toMatchObject({
      result: "resolved",
      comment: "fresh comment",
    });
    expect(ba.monitoringRecords[0]).toMatchObject({
      result: "resolved",
      comment: "fresh comment",
    });
    expect(ab.monitoringRecords).toEqual(ba.monitoringRecords);
  });

  it("does not let a legacy archive overwrite versioned fields", () => {
    const versioned = {
      id: "same-leak",
      leak_id: "L-1",
      pressure: 12,
      comment: "new comment",
      emptyLocalField: "",
      updatedAt: 500,
      _fieldUpdatedAt: { pressure: 500, comment: 100, emptyLocalField: 500 },
    };
    const legacy = {
      id: "same-leak",
      leak_id: "L-1",
      pressure: 10,
      comment: "legacy comment",
      emptyLocalField: "legacy fill must not revive explicit empty",
      location: "legacy-only location",
      updatedAt: 400,
    };

    const localNew = mergeLeaksByFreshness([versioned], [legacy], {
      source: "archive",
    }).leaks[0];
    const incomingNew = mergeLeaksByFreshness([legacy], [versioned], {
      source: "archive",
    }).leaks[0];

    for (const result of [localNew, incomingNew]) {
      expect(result).toMatchObject({
        pressure: 12,
        comment: "new comment",
        emptyLocalField: "",
        location: "legacy-only location",
      });
    }
  });

  it("is idempotent when the same versioned archive is merged repeatedly", () => {
    const local = {
      id: "same-leak",
      leak_id: "L-1",
      status: "open",
      updatedAt: 100,
      _fieldUpdatedAt: { status: 100 },
    };
    const incoming = {
      id: "same-leak",
      leak_id: "L-1",
      status: "resolved",
      updatedAt: 200,
      _fieldUpdatedAt: { status: 200 },
    };
    const once = mergeLeaksByFreshness([local], [incoming], {
      source: "archive",
    }).leaks;
    const twice = mergeLeaksByFreshness(once, [incoming], {
      source: "archive",
    }).leaks;
    expect(twice).toEqual(once);
  });
});
