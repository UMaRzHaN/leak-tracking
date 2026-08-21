import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  deleteProjectPhotos: vi.fn(),
  clearProjectSettings: vi.fn(),
  clearProjectFilters: vi.fn(),
  clearProjectSyncState: vi.fn(),
  saveMonitoringRound: vi.fn(),
  removeComponents: vi.fn(),
  removeSchemas: vi.fn(),
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
vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { remove: mocks.removeComponents },
}));
vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: { removeProjectSchemas: mocks.removeSchemas },
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

const { deleteProjectArtifacts, rollbackImportedProject } =
  await import("./projectCleanup");

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

describe("deleteProjectArtifacts", () => {
  const project = { id: "p1", folderName: "alpha" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.removeComponents.mockResolvedValue(true);
    mocks.removeSchemas.mockResolvedValue(true);
  });

  it("removes the component registry along with the project", async () => {
    // Реестр живёт под своим ключом, а не в папке проекта: он оставался и
    // всплывал в проекте, заведённом потом под тем же именем.
    await deleteProjectArtifacts(project);

    expect(mocks.removeComponents).toHaveBeenCalledWith(project);
    expect(mocks.removeSchemas).toHaveBeenCalledWith(project);
    expect(mocks.deleteProjectPhotos).toHaveBeenCalledWith("p1", "alpha");
  });

  it("finishes the cleanup even when the registry refuses to go", async () => {
    mocks.removeComponents.mockRejectedValue(new Error("реестр занят"));

    await expect(deleteProjectArtifacts(project)).resolves.toBeUndefined();
  });
});
