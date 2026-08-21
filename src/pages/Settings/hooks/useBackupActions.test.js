import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";

// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  // vi.fn so a test can still override the hook's return value.
  return { useLanguage: vi.fn(englishLanguageHook().useLanguage) };
});

vi.mock("@/repositories/LeakRepository", () => ({
  LeakRepository: {
    getAll: vi.fn(),
  },
}));

const componentRepository = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: componentRepository,
}));

const platformState = vi.hoisted(() => ({ isNative: false }));
const nativeWriter = vi.hoisted(() => ({
  append: vi.fn(),
  writePublicFileStream: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return platformState.isNative;
  },
}));

vi.mock("@/services/storage/publicFileWriter", () => ({
  writePublicFileStream: nativeWriter.writePublicFileStream,
}));

vi.mock("@/services/backup/projectBackupService", () => ({
  peekBackupZip: vi.fn(),
  previewArchiveComponents: vi.fn(),
  buildProjectBackupZip: vi.fn(),
  streamProjectBackupZip: vi.fn(),
  previewMergeLeaks: vi.fn(),
}));

const languageModule = await import("@/app/hooks/useLanguage");
const repositoryModule = await import("@/repositories/LeakRepository");
const servicesModule = await import("@/services/backup/projectBackupService");
const { useBackupActions } = await import("./useBackupActions");

describe("useBackupActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformState.isNative = false;
    nativeWriter.writePublicFileStream.mockImplementation(({ produce }) =>
      produce(nativeWriter.append),
    );
    languageModule.useLanguage.mockReturnValue({ lang: "en", t: translate });
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
    componentRepository.load.mockResolvedValue([]);
    servicesModule.previewMergeLeaks.mockReturnValue({
      added: 1,
      updated: 0,
      skipped: 0,
      archivePhotos: 0,
      total: 1,
      changed: 1,
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
    expect(result.current.conflictState.mergePreview.added).toBe(1);
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
    expect(notify).toHaveBeenCalledWith(
      "info",
      "Reading ZIP backup, please wait...",
      { autoCloseMs: 0 },
    );

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(onImportZip).toHaveBeenCalledWith(file, undefined);
    expect(notify).toHaveBeenCalledWith(
      "info",
      "ZIP backup import in progress, please wait...",
      { autoCloseMs: 0 },
    );
    expect(notify).toHaveBeenCalledWith(
      "success",
      'Project "Alpha" imported (1 record)',
    );
    expect(result.current.importConfirmState.open).toBe(false);
  });

  it("shows a persistent notification while exporting zip backup", async () => {
    const notify = vi.fn();
    servicesModule.buildProjectBackupZip.mockResolvedValue(
      new Blob(["zip"], { type: "application/zip" }),
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:backup");
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const { result } = renderHook(() =>
      useBackupActions({
        data: [{ id: "l1" }],
        idbGetPhoto: vi.fn(),
        activeProject: { id: "active-1", folderName: "active" },
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(notify).toHaveBeenCalledWith(
      "info",
      "ZIP backup export in progress, please wait...",
      { autoCloseMs: 0 },
    );
    expect(notify).toHaveBeenCalledWith(
      "success",
      "ZIP archive downloaded (1 record)",
    );
    expect(result.current.isExportingZip).toBe(false);

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    click.mockRestore();
  });

  it("streams native ZIP export without building a complete Blob", async () => {
    platformState.isNative = true;
    servicesModule.streamProjectBackupZip.mockImplementation(
      async ({ writeChunk }) => writeChunk(new Uint8Array([1, 2, 3])),
    );
    const notify = vi.fn();
    const idbGetPhoto = vi.fn();
    const project = { id: "active-1", folderName: "active" };
    const vars = { density: 0.7 };

    const { result } = renderHook(() =>
      useBackupActions({
        data: [{ id: "l1", photo: "idb://photo-1" }],
        idbGetPhoto,
        activeProject: project,
        vars,
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => result.current.handleExportZip());

    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
    expect(servicesModule.streamProjectBackupZip).toHaveBeenCalledWith({
      leaks: [{ id: "l1", photo: "idb://photo-1" }],
      idbGet: idbGetPhoto,
      project,
      vars,
      writeChunk: nativeWriter.append,
    });
    expect(nativeWriter.append).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(nativeWriter.writePublicFileStream).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "active/Leaks/zip_backup",
        fileName: "active.zip",
        mimeType: "application/zip",
        produce: expect.any(Function),
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      "success",
      "ZIP saved to Documents/active/Leaks/zip_backup/",
    );
  });
  it("warns instead of building an empty backup", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: { id: "active-1", folderName: "active" },
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => result.current.handleExportZip());

    expect(notify).toHaveBeenCalledWith("warning", "No data to export");
    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
  });

  it("reports backup build failures and always clears exporting state", async () => {
    const notify = vi.fn();
    servicesModule.buildProjectBackupZip.mockRejectedValueOnce(
      new Error("disk full"),
    );
    const { result } = renderHook(() =>
      useBackupActions({
        data: [{ id: "l1" }],
        idbGetPhoto: vi.fn(),
        activeProject: { id: "active-1", folderName: "active" },
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => result.current.handleExportZip());

    expect(notify).toHaveBeenCalledWith("error", "Export error: disk full");
    expect(result.current.isExportingZip).toBe(false);
  });

  it("rejects an archive whose project type cannot be determined", async () => {
    const notify = vi.fn();
    servicesModule.peekBackupZip.mockResolvedValueOnce({
      leaks: [],
      meta: null,
      detectedType: null,
    });
    const event = {
      target: { files: [{ name: "unknown.zip" }], value: "filled" },
    };
    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: null,
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => result.current.handleImportZip(event));

    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Could not determine the project type"),
    );
    expect(result.current.importConfirmState.open).toBe(false);
    expect(event.target.value).toBe("");
  });

  it("supports overwrite, merge, and copy conflict resolutions", async () => {
    const notify = vi.fn();
    const file = { name: "alpha.zip" };
    const existingProject = {
      id: "p1",
      name: "Alpha",
      folderName: "alpha",
    };
    const onImportIntoExisting = vi.fn().mockResolvedValue({
      project: existingProject,
      leakCount: 2,
    });
    const onImportZip = vi.fn().mockResolvedValue({
      project: { id: "p2", name: "Alpha (2)" },
      leakCount: 2,
    });
    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: existingProject,
        vars: {},
        onImportZip,
        onImportIntoExisting,
        notify,
        projects: [existingProject],
      }),
    );
    const conflict = {
      open: true,
      file,
      existingProject,
      resolvedName: "Alpha",
      resolvedType: "upstream",
      fallback: undefined,
    };

    act(() => result.current.setConflictState(conflict));
    await act(async () => result.current.handleConflictOverwrite());
    expect(onImportIntoExisting).toHaveBeenLastCalledWith(
      file,
      existingProject,
      "overwrite",
    );

    act(() => result.current.setConflictState(conflict));
    await act(async () => result.current.handleConflictMerge());
    expect(onImportIntoExisting).toHaveBeenLastCalledWith(
      file,
      existingProject,
      "merge",
    );

    act(() => result.current.setConflictState(conflict));
    await act(async () => result.current.handleConflictCopy());
    expect(onImportZip).toHaveBeenCalledWith(
      file,
      { name: "Alpha (2)", type: "upstream" },
      { overrideName: "Alpha (2)" },
    );
    expect(notify).toHaveBeenCalledWith(
      "success",
      'Copy "Alpha (2)" created (2 records)',
    );
    expect(result.current.conflictState.open).toBe(false);
  });

  it.each([
    [
      "PROJECT_TYPE_MISMATCH",
      {
        existingProjectType: "upstream",
        incomingProjectType: "downstream",
      },
      "Projects of different types cannot be combined: current — Upstream, imported — Downstream.",
    ],
    [
      "PROJECT_TYPE_MISSING",
      {},
      "The archive does not specify a project type. Import into the existing project was cancelled.",
    ],
    [
      "CURRENT_PROJECT_TYPE_MISSING",
      {},
      "The current project has no defined type. Import was cancelled.",
    ],
  ])(
    "shows a dedicated import error for %s",
    async (code, details, message) => {
      const notify = vi.fn();
      const file = { name: "alpha.zip" };
      const existingProject = {
        id: "p1",
        name: "Alpha",
        folderName: "alpha",
        type: "upstream",
      };
      const error = Object.assign(new Error("generic"), { code, ...details });
      const onImportIntoExisting = vi.fn().mockRejectedValue(error);
      const { result } = renderHook(() =>
        useBackupActions({
          data: [],
          idbGetPhoto: vi.fn(),
          activeProject: existingProject,
          vars: {},
          onImportZip: vi.fn(),
          onImportIntoExisting,
          notify,
          projects: [existingProject],
        }),
      );

      act(() =>
        result.current.setConflictState({
          open: true,
          file,
          existingProject,
          resolvedName: "Alpha",
          resolvedType: "upstream",
        }),
      );
      await act(async () => result.current.handleConflictMerge());

      expect(notify).toHaveBeenCalledWith("error", message);
      expect(result.current.conflictState.open).toBe(false);
    },
  );

  it("keeps generic import errors prefixed and closes confirmation", async () => {
    const notify = vi.fn();
    const onImportZip = vi.fn().mockRejectedValue(new Error("broken archive"));
    const file = { name: "alpha.zip" };
    const event = { target: { files: [file], value: "filled" } };
    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: null,
        vars: {},
        onImportZip,
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );

    await act(async () => result.current.handleImportZip(event));
    await act(async () => result.current.confirmImport());

    expect(notify).toHaveBeenCalledWith(
      "error",
      "Import error: broken archive",
    );
    expect(result.current.importConfirmState.open).toBe(false);
  });
});

describe("useBackupActions ZIP export with no leaks", () => {
  const project = {
    id: "p1",
    name: "Alpha",
    type: "upstream",
    folderName: "Alpha",
  };

  function renderExport(notify) {
    return renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: project,
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify,
        projects: [],
      }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    platformState.isNative = false;
    languageModule.useLanguage.mockReturnValue({ lang: "en", t: translate });
  });

  it("still exports a project whose registry holds components", async () => {
    componentRepository.load.mockResolvedValue([{ id: "c1", tag: "V-100" }]);
    const notify = vi.fn();
    const { result } = renderExport(notify);

    await act(async () => result.current.handleExportZip());

    expect(servicesModule.buildProjectBackupZip).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith("warning", expect.anything());
  });

  it("refuses only when neither leaks nor components exist", async () => {
    componentRepository.load.mockResolvedValue([]);
    const notify = vi.fn();
    const { result } = renderExport(notify);

    await act(async () => result.current.handleExportZip());

    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("warning", "No data to export");
  });

  it("refuses when the registry cannot be read, rather than exporting nothing", async () => {
    componentRepository.load.mockRejectedValue(new Error("registry is broken"));
    const notify = vi.fn();
    const { result } = renderExport(notify);

    await act(async () => result.current.handleExportZip());

    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("warning", "No data to export");
  });
});

describe("useBackupActions conflict dialog", () => {
  it("clears the progress notice and previews the registry", async () => {
    // Сообщение о чтении висело поверх вопроса, на который человек как раз
    // отвечает, а про карточки диалог молчал вовсе.
    servicesModule.previewArchiveComponents.mockResolvedValue({
      added: 12,
      updated: 3,
      total: 15,
      photos: 9,
    });
    repositoryModule.LeakRepository.getAll.mockResolvedValue([]);
    const dismissNotification = vi.fn();
    const { result } = renderHook(() =>
      useBackupActions({
        data: [],
        idbGetPhoto: vi.fn(),
        activeProject: { id: "p1", name: "Alpha", folderName: "Alpha" },
        vars: {},
        onImportZip: vi.fn(),
        onImportIntoExisting: vi.fn(),
        notify: vi.fn(),
        dismissNotification,
        projects: [{ id: "p1", name: "Alpha", folderName: "Alpha" }],
      }),
    );

    await act(async () => {
      await result.current.handleImportZip({
        target: { files: [{ name: "Alpha.zip" }], value: "filled" },
      });
    });

    expect(dismissNotification).toHaveBeenCalled();
    expect(result.current.conflictState).toMatchObject({
      open: true,
      registryPreview: { added: 12, updated: 3, photos: 9 },
    });
  });
});
