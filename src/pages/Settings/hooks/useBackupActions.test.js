import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("@/repositories/LeakRepository", () => ({
  LeakRepository: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/utils/platform", () => ({
  isNative: false,
}));

vi.mock("@/services/projectBackupService", () => ({
  peekBackupZip: vi.fn(),
  buildProjectBackupZip: vi.fn(),
}));

const languageModule = await import("@/app/hooks/useLanguage");
const repositoryModule = await import("@/repositories/LeakRepository");
const servicesModule = await import("@/services/projectBackupService");
const { useBackupActions } = await import("./useBackupActions");

describe("useBackupActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    languageModule.useLanguage.mockReturnValue({ lang: "en" });
    repositoryModule.LeakRepository.getAll.mockResolvedValue([
      { id: "l1" },
      { id: "l2" },
    ]);
    servicesModule.peekBackupZip.mockResolvedValue({
      leaks: [{ id: "new-1" }],
      meta: {
        project: {
          name: "Alpha",
          type: "upstream",
        },
      },
      detectedType: "upstream",
    });
  });

  it("opens conflict state when imported project name already exists", async () => {
    const notify = vi.fn();
    const event = {
      target: {
        files: [{ name: "alpha.zip" }],
        value: "filled",
      },
    };

    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: { id: "active-1", folderName: "active" },
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [
          {
            id: "p1",
            name: "Alpha",
            folderName: "alpha",
          },
        ],
      }),
    );

    await act(async () => {
      await result.current.handleImportZip(event);
    });

    expect(repositoryModule.LeakRepository.getAll).toHaveBeenCalledWith({
      projectId: "p1",
      folderName: "alpha",
    });
    expect(result.current.conflictState.open).toBe(true);
    expect(result.current.conflictState.resolvedName).toBe("Alpha");
    expect(result.current.conflictState.existingProject.leakCount).toBe(2);
    expect(event.target.value).toBe("");
    expect(notify).not.toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Import error"),
    );
  });

  it("opens import confirmation for a new project and imports after approval", async () => {
    const notify = vi.fn();
    const onImportZip = vi.fn().mockResolvedValue({
      project: { id: "p2", name: "Alpha" },
      leakCount: 1,
    });
    const file = { name: "alpha.zip" };
    const event = {
      target: {
        files: [file],
        value: "filled",
      },
    };

    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: { id: "active-1", folderName: "active" },
        vars: {},
        onImportZip,
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => {
      await result.current.handleImportZip(event);
    });

    expect(result.current.importConfirmState.open).toBe(true);
    expect(onImportZip).not.toHaveBeenCalled();
    expect(event.target.value).toBe("");

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(onImportZip).toHaveBeenCalledWith(file, undefined);
    expect(notify).toHaveBeenCalledWith(
      "success",
      'Project "Alpha" imported (1 record)',
    );
    expect(result.current.importConfirmState.open).toBe(false);
  });
});
