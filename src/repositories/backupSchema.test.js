import { describe, expect, it } from "vitest";
import {
  validateBackup,
  validateBackupRecovery,
  validateProjectBackupMeta,
} from "./backupSchema";

const validProject = {
  name: "Alpha",
  type: "upstream",
  folderName: "alpha",
  syncId: "sync-alpha-1234",
};

describe("backupSchema leak validation", () => {
  it("accepts supported IDs, statuses, optional text, and portable photos", () => {
    const result = validateBackup([
      {
        id: 1,
        leak_id: "TAG-1",
        lat: 10,
        lng: 20,
        status: "resolved",
        component: "Valve",
        leak_description: "Packing",
        photo: "zip:photos/one/before.jpg",
        photo_after: "data:image/jpeg;base64,AA==",
        monitoringRecords: [
          { id: "m1", photo: "zip:photos/one/monitoring_m1.jpg" },
        ],
      },
      {
        id: "two",
        photo: "zip:photos/two.jpg",
        photo_after: "data:image/png;base64,AA==",
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.data[1].status).toBe("open");
  });

  it.each([
    "idb://photo_other_leak_1",
    "data://LeakReports/Victim/data/data.json",
    "Documents/repair.jpg",
    "zip:photos/../backup.json",
  ])("rejects non-portable or unsafe photo path %s", (photo) => {
    const result = validateBackup([{ id: "unsafe-photo", photo }]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("photo");
  });

  it("validates monitoring photo paths", () => {
    const result = validateBackup([
      {
        id: "unsafe-monitoring-photo",
        monitoringRecords: [
          { id: "m1", photo: "data://LeakReports/Victim/data/data.json" },
        ],
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("monitoringRecords");
  });

  it.each([
    [{ id: "x", monitoringRecords: {} }, "monitoringRecords"],
    [{ id: "x", monitoringRecords: ["poison"] }, "monitoringRecords"],
    [{ id: "x", history: "poison" }, "history"],
    [{ id: "x", history: [null] }, "history"],
  ])("rejects malformed nested record collections %#", (leak, field) => {
    const result = validateBackup([leak]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain(field);
  });

  it("rejects duplicate canonical leak ids, including number/string aliases", () => {
    const result = validateBackup([
      { id: 1, status: "open" },
      { id: "1", status: "resolved" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("[1.id]");
    expect(result.error).toContain("Duplicate canonical leak id");
  });

  it.each([
    [null, "Expected object"],
    [{ id: "" }, "id"],
    [{ id: true }, "id"],
    [{ id: "x", lat: "10" }, "lat"],
    [{ id: "x", lng: Number.POSITIVE_INFINITY }, "lng"],
    [{ id: "x", status: "closed" }, "status"],
    [{ id: "x", leak_id: {} }, "leak_id"],
    [{ id: "x", component: 42 }, "component"],
    [{ id: "x", leak_description: [] }, "leak_description"],
    [{ id: "x", photo: "https://example.com/photo.jpg" }, "photo"],
    [{ id: "x", photo_after: "file://after" }, "photo_after"],
    [{ id: "x", photo_repair: 123 }, "photo_repair"],
  ])("rejects malformed leak value %#", (leak, expectedPath) => {
    const result = validateBackup([leak]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain(expectedPath);
  });

  it("limits the formatted validation error to the first three issues", () => {
    const result = validateBackup([
      { id: "", lat: "bad", lng: "bad", status: "bad" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("id");
    expect(result.error).toContain("lat");
    expect(result.error).toContain("lng");
    expect(result.error).not.toContain("status");
  });

  it("rejects excessively deep arbitrary backup fields", () => {
    let nested = "leaf";
    for (let depth = 0; depth < 22; depth += 1) nested = { nested };

    const result = validateBackup([{ id: "deep", extra: nested }]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("nesting");
  });
});

describe("backupSchema project metadata validation", () => {
  it("accepts complete monitoring and synchronization metadata", () => {
    const meta = {
      schemaVersion: 2,
      exportedAt: "2026-07-20T10:00:00.000Z",
      project: validProject,
      vars: { density: 0.7 },
      settings: {
        hiddenFields: ["component"],
        excelMonitoringExportMode: "latest_per_round",
        photoRequirements: {
          leakPhotoRequired: false,
          monitoringPhotoRequired: true,
        },
        updatedAt: 100,
      },
      monitoringRound: {
        id: "round-2",
        number: "2",
        startedAt: "2026-07-20T09:00:00.000Z",
        completedAt: "2026-07-20T10:00:00.000Z",
      },
      sync: {
        varsUpdatedAt: "100",
        deleted: { "leak:1": 200 },
      },
    };

    expect(validateProjectBackupMeta(meta)).toEqual({ ok: true, data: meta });
  });

  it.each([
    [null, "Expected object"],
    [{ project: null }, "project"],
    [{ project: { ...validProject, name: "" } }, "name"],
    [{ project: { ...validProject, name: "   " } }, "name"],
    [{ project: { ...validProject, folderName: 10 } }, "folderName"],
    [{ project: { ...validProject, syncId: "short" } }, "syncId"],
    [{ project: validProject, schemaVersion: -1 }, "schemaVersion"],
    [{ project: validProject, schemaVersion: 1.5 }, "schemaVersion"],
    [{ project: validProject, exportedAt: 100 }, "exportedAt"],
    [{ project: validProject, vars: [] }, "vars"],
    [{ project: validProject, settings: [] }, "settings"],
    [
      { project: validProject, settings: { hiddenFields: [42] } },
      "hiddenFields",
    ],
    [
      {
        project: validProject,
        settings: { excelMonitoringExportMode: "unknown" },
      },
      "excelMonitoringExportMode",
    ],
    [
      {
        project: validProject,
        settings: { photoRequirements: { leakPhotoRequired: "yes" } },
      },
      "leakPhotoRequired",
    ],
    [{ project: validProject, settings: { updatedAt: -1 } }, "updatedAt"],
    [{ project: validProject, monitoringRound: [] }, "monitoringRound"],
    [
      {
        project: validProject,
        monitoringRound: { id: "", startedAt: 10, completedAt: 20, number: 0 },
      },
      "monitoringRound",
    ],
    [{ project: validProject, sync: [] }, "sync"],
    [{ project: validProject, sync: { varsUpdatedAt: -1 } }, "varsUpdatedAt"],
    [{ project: validProject, sync: { deleted: [] } }, "deleted"],
    [{ project: validProject, sync: { deleted: { "": 100 } } }, "deleted"],
    [{ project: validProject, sync: { deleted: { "leak:1": 0 } } }, "leak:1"],
  ])("rejects malformed project metadata %#", (meta, expectedPath) => {
    const result = validateProjectBackupMeta(meta);

    expect(result.ok).toBe(false);
    expect(result.error).toContain(expectedPath);
  });
});

describe("backupSchema recovery validation", () => {
  it("preserves records that intentionally fail the normal backup schema", () => {
    const records = [
      { id: "duplicate", status: "unsupported" },
      { id: "duplicate", photo: 42 },
      "unparseable legacy value",
    ];

    expect(validateBackupRecovery(records)).toEqual({
      ok: true,
      data: records,
    });
  });

  it("still enforces complexity limits on recovery data", () => {
    let nested = "leaf";
    for (let depth = 0; depth < 22; depth += 1) nested = { nested };

    const result = validateBackupRecovery([nested]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("nesting");
  });
});
