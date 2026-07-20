import { describe, expect, it } from "vitest";
import { validateBackup, validateProjectBackupMeta } from "./backupSchema";

const validProject = {
  name: "Alpha",
  type: "upstream",
  folderName: "alpha",
  syncId: "sync-alpha-1234",
};

describe("backupSchema leak validation", () => {
  it("accepts supported IDs, statuses, optional text, and photo paths", () => {
    const result = validateBackup([
      {
        id: 1,
        leak_id: "TAG-1",
        lat: 10,
        lng: 20,
        status: "resolved",
        component: "Valve",
        leak_description: "Packing",
        photo: "idb://before",
        photo_after: "data://after",
        photo_repair: "Documents/repair.jpg",
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
});

describe("backupSchema project metadata validation", () => {
  it("accepts complete monitoring and synchronization metadata", () => {
    const meta = {
      schemaVersion: 2,
      exportedAt: "2026-07-20T10:00:00.000Z",
      project: validProject,
      vars: { density: 0.7 },
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
    [{ project: { ...validProject, folderName: 10 } }, "folderName"],
    [{ project: { ...validProject, syncId: "short" } }, "syncId"],
    [{ project: validProject, schemaVersion: -1 }, "schemaVersion"],
    [{ project: validProject, schemaVersion: 1.5 }, "schemaVersion"],
    [{ project: validProject, exportedAt: 100 }, "exportedAt"],
    [{ project: validProject, vars: [] }, "vars"],
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
