import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  deleteProjectPhotos: vi.fn(),
  clearProjectSettings: vi.fn(),
  clearProjectFilters: vi.fn(),
  clearProjectSyncState: vi.fn(),
  saveMonitoringRound: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { rmdir: vi.fn() },
  Directory: { Data: "DATA" },
}));
vi.mock("@/repositories/LeakRepository", () => ({
  LeakRepository: { clear: mocks.clear },
}));
vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: { deleteProjectPhotos: mocks.deleteProjectPhotos },
}));
vi.mock("@/app/project/projectSettings", () => ({
  clearProjectSettings: mocks.clearProjectSettings,
}));
vi.mock("@/app/project/projectFilters", () => ({
  clearProjectFilters: mocks.clearProjectFilters,
}));
vi.mock("@/services/sync/projectSyncState", () => ({
  clearProjectSyncState: mocks.clearProjectSyncState,
}));
vi.mock("@/utils/monitoringRound", () => ({
  saveMonitoringRound: mocks.saveMonitoringRound,
}));

const { rollbackImportedProject } = await import("./projectCleanup");

describe("rollbackImportedProject", () => {
  const project = { id: "p1", folderName: "alpha" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clear.mockResolvedValue(undefined);
    mocks.deleteProjectPhotos.mockResolvedValue(undefined);
    mocks.clearProjectSyncState.mockResolvedValue(undefined);
  });

  it("does not destroy artifacts when metadata removal fails", async () => {
    const removeProject = vi.fn(() => {
      throw new Error("metadata unavailable");
    });

    await expect(
      rollbackImportedProject(project, removeProject),
    ).rejects.toThrow("metadata unavailable");
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.deleteProjectPhotos).not.toHaveBeenCalled();
  });

  it("removes metadata before cleaning imported artifacts", async () => {
    const removeProject = vi.fn(() => true);
    const result = await rollbackImportedProject(project, removeProject);

    expect(removeProject).toHaveBeenCalledWith(project.id);
    expect(removeProject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clear.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      metadataRemoved: true,
      cleanupComplete: true,
    });
  });

  it("returns a structured orphan-cleanup failure", async () => {
    const cleanupError = new Error("filesystem unavailable");
    mocks.clear.mockRejectedValueOnce(cleanupError);

    await expect(
      rollbackImportedProject(
        project,
        vi.fn(() => true),
      ),
    ).resolves.toMatchObject({
      metadataRemoved: true,
      cleanupComplete: false,
      cleanupError,
    });
  });
});
