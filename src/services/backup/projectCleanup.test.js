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
    mocks.clear.mockReset().mockResolvedValue(undefined);
    mocks.deleteProjectPhotos.mockReset().mockResolvedValue(undefined);
    mocks.clearProjectSyncState.mockReset().mockResolvedValue(undefined);
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

  it("removes the rounds, invoices and survey kept in localStorage", async () => {
    localStorage.setItem("app:p1:acceptances_v1", "[]");
    localStorage.setItem("app:p1:survey_v1", "{}");
    const round = JSON.stringify({ number: 2, startedAt: "2026-10-01" });
    localStorage.setItem("app:p1:repair_round_v1", round);
    localStorage.setItem("app:p1:reconcile_round_v1", round);

    await deleteProjectArtifacts(project);

    expect(mocks.saveMonitoringRound).toHaveBeenCalledWith("p1", null);
    // Обходы ремонтов и сверки уходят вместе с обходом мониторинга.
    expect(localStorage.getItem("app:p1:repair_round_v1")).toBeNull();
    expect(localStorage.getItem("app:p1:reconcile_round_v1")).toBeNull();
    expect(localStorage.getItem("app:p1:acceptances_v1")).toBeNull();
    expect(localStorage.getItem("app:p1:survey_v1")).toBeNull();
  });

  it("removes the registry and drawings even when leaks and photos fail", async () => {
    // Шаги шли цепочкой await: осечка стирания утечек обрывала уборку, и
    // реестр с чертежами оставались на диске навсегда.
    const purgeError = new Error("база занята");
    const photoError = new Error("снимки не стёрлись");
    mocks.clear.mockRejectedValueOnce(purgeError);
    mocks.deleteProjectPhotos.mockRejectedValueOnce(photoError);
    localStorage.setItem("app:p1:survey_v1", "{}");

    const error = await deleteProjectArtifacts(project).catch((e) => e);

    expect(mocks.deleteProjectPhotos).toHaveBeenCalledWith("p1", "alpha");
    expect(mocks.removeComponents).toHaveBeenCalledWith(project);
    expect(mocks.removeSchemas).toHaveBeenCalledWith(project);
    expect(localStorage.getItem("app:p1:survey_v1")).toBeNull();
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([purgeError, photoError]);
  });

  it("throws a single failure as it is", async () => {
    const syncError = new Error("sync state locked");
    mocks.clearProjectSyncState.mockRejectedValueOnce(syncError);

    await expect(deleteProjectArtifacts(project)).rejects.toBe(syncError);
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.removeSchemas).toHaveBeenCalledWith(project);
  });

  it("removes every key under the project prefix and nothing else", async () => {
    const leftovers = [
      "app:p1:route_v1",
      "app:p1:form_draft_v2",
      "app:p1:component_draft_v1",
      "app:p1:hidden_component_fields_v1",
      "app:p1:export_history_v1",
      "app:p1:export_sheets_v1",
    ];
    for (const key of leftovers) localStorage.setItem(key, "{}");
    localStorage.setItem("app:p10:route_v1", "keep");
    localStorage.setItem("app:projects_v1", "keep");

    await deleteProjectArtifacts(project);

    for (const key of leftovers) expect(localStorage.getItem(key)).toBeNull();
    // Чужой проект с похожим id и общие ключи приложения не трогаются.
    expect(localStorage.getItem("app:p10:route_v1")).toBe("keep");
    expect(localStorage.getItem("app:projects_v1")).toBe("keep");
  });

  it("finishes the cleanup even when the registry refuses to go", async () => {
    mocks.removeComponents.mockRejectedValue(new Error("реестр занят"));

    await expect(deleteProjectArtifacts(project)).resolves.toBeUndefined();
  });
});
