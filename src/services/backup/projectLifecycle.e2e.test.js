import { afterEach, describe, expect, it, vi } from "vitest";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  buildProjectBackupZip,
  importIntoExistingProject,
  importProjectZip,
} from "./projectBackupService";

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

const PROJECT = {
  id: "lifecycle-project",
  name: "Lifecycle E2E",
  type: "upstream",
  folderName: "Lifecycle_E2E",
  syncId: "lifecycle-sync-2026",
};

const png = (value) => new Blob([value], { type: "image/png" });

describe("project lifecycle backup and synchronization", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("creates, changes, monitors, syncs and restores a project with photos", async () => {
    localStorage.setItem(
      `app:${PROJECT.id}:monitoring_round_v2`,
      JSON.stringify({
        id: "round-1",
        number: 1,
        startedAt: "2026-07-20T08:00:00.000Z",
        completedAt: "2026-07-20T09:00:00.000Z",
      }),
    );

    const changedOnDeviceA = {
      id: "shared-leak",
      leak_id: "TAG-1",
      status: "in_progress",
      description: "Changed on device A",
      lat: 41.3111,
      lng: 69.2797,
      createdAt: 100,
      updatedAt: 400,
      photo: "idb://device-a-before",
      photo_repair: "idb://device-a-repair",
      monitoringRecords: [
        {
          id: "monitoring-1",
          roundId: "round-1",
          roundNumber: 1,
          date: "2026-07-20T08:30:00.000Z",
          result: "still_leaking",
          comment: "Leak confirmed during monitoring",
          photo: "idb://device-a-monitoring",
          previousPhoto: "idb://device-a-monitoring-before",
        },
      ],
    };
    const deviceAPhotos = new Map([
      ["device-a-before", png("before-photo")],
      ["device-a-repair", png("repair-photo")],
      ["device-a-monitoring", png("monitoring-photo")],
      ["device-a-monitoring-before", png("monitoring-before-photo")],
    ]);
    const archiveFromDeviceA = await buildProjectBackupZip({
      leaks: [changedOnDeviceA],
      idbGet: (key) => deviceAPhotos.get(key),
      project: PROJECT,
      vars: { density: 0.7168 },
    });

    const olderSharedLeak = {
      id: "shared-leak",
      leak_id: "TAG-1",
      status: "open",
      description: "Created on device B",
      lat: 41.3111,
      lng: 69.2797,
      createdAt: 100,
      updatedAt: 150,
      photo: "idb://device-b-before",
    };
    const independentDeviceBLeak = {
      id: "device-b-only",
      leak_id: "TAG-2",
      status: "open",
      lat: 40.7831,
      lng: 72.3439,
      createdAt: 200,
      updatedAt: 300,
    };
    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([
      olderSharedLeak,
      independentDeviceBLeak,
    ]);
    const savePhoto = vi
      .spyOn(PhotoRepository, "save")
      .mockImplementation(
        async (_blob, { leakId }) => `idb://synced-${leakId}`,
      );
    vi.spyOn(PhotoRepository, "gcOrphaned").mockResolvedValue(undefined);

    let synchronizedLeaks = null;
    const syncContext = {
      existingProject: PROJECT,
      overwriteProject: vi.fn(() => true),
      setProjectSyncId: vi.fn(),
      saveRef: {
        current: vi.fn(async (leaks) => {
          synchronizedLeaks = leaks;
        }),
      },
      activeProjectIdRef: { current: PROJECT.id },
      photoReadyRef: { current: true },
    };

    await importIntoExistingProject(archiveFromDeviceA, syncContext, "sync");

    expect(synchronizedLeaks).toHaveLength(2);
    const synchronizedShared = synchronizedLeaks.find(
      (leak) => leak.id === "shared-leak",
    );
    expect(synchronizedShared).toMatchObject({
      status: "in_progress",
      description: "Changed on device A",
      photo: "idb://synced-TAG-1",
      photo_repair: "idb://synced-TAG-1_repair",
    });
    expect(synchronizedShared.monitoringRecords[0]).toMatchObject({
      id: "monitoring-1",
      result: "still_leaking",
      photo: "idb://synced-TAG-1_monitoring_monitoring-1",
      previousPhoto: "idb://synced-TAG-1_monitoring_monitoring-1_previousPhoto",
    });
    expect(synchronizedLeaks.some((leak) => leak.id === "device-b-only")).toBe(
      true,
    );
    expect(savePhoto).toHaveBeenCalledTimes(4);

    const synchronizedPhotos = new Map([
      ["synced-TAG-1", png("before-photo")],
      ["synced-TAG-1_repair", png("repair-photo")],
      ["synced-TAG-1_monitoring_monitoring-1", png("monitoring-photo")],
      [
        "synced-TAG-1_monitoring_monitoring-1_previousPhoto",
        png("monitoring-before-photo"),
      ],
    ]);
    const postSyncBackup = await buildProjectBackupZip({
      leaks: synchronizedLeaks,
      idbGet: (key) => synchronizedPhotos.get(key),
      project: PROJECT,
      vars: { density: 0.7168 },
    });

    const restoredProject = {
      ...PROJECT,
      id: "restored-project",
      folderName: "Lifecycle_E2E_restored",
    };
    let restoredLeaks = null;
    const restoreContext = {
      activeProjectIdRef: { current: null },
      photoReadyRef: { current: true },
      removeProject: vi.fn(),
      addProject: vi.fn((_name, _type, options) => {
        const project = { ...restoredProject, syncId: options?.syncId };
        restoreContext.activeProjectIdRef.current = project.id;
        return project;
      }),
      savePhotoRef: {
        current: vi.fn(async (_blob, leakId) => `idb://restored-${leakId}`),
      },
      saveRef: {
        current: vi.fn(async (leaks) => {
          restoredLeaks = leaks;
        }),
      },
    };

    const restored = await importProjectZip(postSyncBackup, restoreContext);

    expect(restored.project.syncId).toBe(PROJECT.syncId);
    expect(restored.leakCount).toBe(2);
    expect(restoredLeaks).toHaveLength(2);
    const restoredShared = restoredLeaks.find(
      (leak) => leak.id === "shared-leak",
    );
    expect(restoredShared).toMatchObject({
      status: "in_progress",
      description: "Changed on device A",
      photo: "idb://restored-TAG-1",
      photo_repair: "idb://restored-TAG-1_repair",
    });
    expect(restoredShared.monitoringRecords[0]).toMatchObject({
      result: "still_leaking",
      photo: "idb://restored-TAG-1_monitoring_monitoring-1",
      previousPhoto:
        "idb://restored-TAG-1_monitoring_monitoring-1_previousPhoto",
    });
    expect(
      JSON.parse(
        localStorage.getItem(`app:${restoredProject.id}:monitoring_round_v2`),
      ),
    ).toMatchObject({ id: "round-1", number: 1 });
  });
});
