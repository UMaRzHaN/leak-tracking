import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rmdir: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  deleteProjectPhotos: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA", Documents: "DOCUMENTS" },
  Filesystem: { rmdir: mocks.rmdir },
}));

vi.mock("@/utils/platform", () => ({ isNative: true }));

vi.mock("@/repositories/LeakRepository", () => ({
  LeakRepository: { clear: mocks.clear },
}));

vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: { deleteProjectPhotos: mocks.deleteProjectPhotos },
}));

const { deleteProjectArtifacts } = await import("./useProjectActions");

describe("native project deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes private project data but preserves exported backups in Documents", async () => {
    const project = {
      id: "project-1",
      folderName: "Project_One",
    };

    await deleteProjectArtifacts(project);

    expect(mocks.clear).toHaveBeenCalledWith({
      projectId: project.id,
      folderName: project.folderName,
    });
    expect(mocks.deleteProjectPhotos).toHaveBeenCalledWith(
      project.id,
      project.folderName,
    );
    expect(mocks.rmdir).toHaveBeenCalledTimes(1);
    expect(mocks.rmdir).toHaveBeenCalledWith({
      path: "LeakReports/Project_One",
      directory: "DATA",
      recursive: true,
    });
    expect(mocks.rmdir).not.toHaveBeenCalledWith(
      expect.objectContaining({ directory: "DOCUMENTS" }),
    );
  });
});
