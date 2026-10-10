import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/test/translate";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return { useLanguage: vi.fn(englishLanguageHook().useLanguage) };
});

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
  buildProjectBackupZip: vi.fn(),
  streamProjectBackupZip: vi.fn(),
}));

const deps = vi.hoisted(() => ({ idbGet: vi.fn(), vars: {} }));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ getPhoto: deps.idbGet }),
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: deps.vars }),
}));

const languageModule = await import("@/app/hooks/useLanguage");
const servicesModule = await import("@/services/backup/projectBackupService");
const { useProjectBackupExport } = await import("./useProjectBackupExport");

describe("useProjectBackupExport (menu ZIP backup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformState.isNative = false;
    deps.vars = {};
    nativeWriter.writePublicFileStream.mockImplementation(({ produce }) =>
      produce(nativeWriter.append),
    );
    languageModule.useLanguage.mockReturnValue({ lang: "en", t: translate });
    componentRepository.load.mockResolvedValue([]);
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
      useProjectBackupExport({
        data: [{ id: "l1" }],
        activeProject: { id: "active-1", folderName: "active" },
        notify,
      }),
    );

    await act(async () => {
      await result.current.exportBackup();
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
    expect(result.current.isExporting).toBe(false);

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    click.mockRestore();
  });

  it("не выгружает архив, пока данные нового проекта не загружены", async () => {
    // Проект уже сменили, а в `data` ещё утечки прежнего: архив получил бы
    // имя нового проекта и чужие записи.
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useProjectBackupExport({
        data: [{ id: "old-leak" }],
        activeProject: { id: "new-1", folderName: "new" },
        dataLoaded: false,
        notify,
      }),
    );

    expect(result.current.canExport).toBe(false);
    await act(async () => {
      await result.current.exportBackup();
    });

    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
    expect(servicesModule.streamProjectBackupZip).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("streams native ZIP export without building a complete Blob", async () => {
    platformState.isNative = true;
    servicesModule.streamProjectBackupZip.mockImplementation(
      async ({ writeChunk }) => writeChunk(new Uint8Array([1, 2, 3])),
    );
    const notify = vi.fn();
    const idbGetPhoto = deps.idbGet;
    const project = { id: "active-1", folderName: "active" };
    const vars = { density: 0.7 };
    deps.vars = vars;

    const { result } = renderHook(() =>
      useProjectBackupExport({
        data: [{ id: "l1", photo: "idb://photo-1" }],
        activeProject: project,
        notify,
      }),
    );

    await act(async () => result.current.exportBackup());

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
      useProjectBackupExport({
        data: [],
        activeProject: { id: "active-1", folderName: "active" },
        notify,
      }),
    );

    await act(async () => result.current.exportBackup());

    expect(notify).toHaveBeenCalledWith("warning", "No data to export");
    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
  });

  it("reports backup build failures and always clears exporting state", async () => {
    const notify = vi.fn();
    servicesModule.buildProjectBackupZip.mockRejectedValueOnce(
      new Error("disk full"),
    );
    const { result } = renderHook(() =>
      useProjectBackupExport({
        data: [{ id: "l1" }],
        activeProject: { id: "active-1", folderName: "active" },
        notify,
      }),
    );

    await act(async () => result.current.exportBackup());

    expect(notify).toHaveBeenCalledWith("error", "Export error: disk full");
    expect(result.current.isExporting).toBe(false);
  });

  const project = {
    id: "p1",
    name: "Alpha",
    type: "upstream",
    folderName: "Alpha",
  };

  function renderExport(notify) {
    return renderHook(() =>
      useProjectBackupExport({
        data: [],
        activeProject: project,
        notify,
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

    await act(async () => result.current.exportBackup());

    expect(servicesModule.buildProjectBackupZip).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith("warning", expect.anything());
  });

  it("refuses only when neither leaks nor components exist", async () => {
    componentRepository.load.mockResolvedValue([]);
    const notify = vi.fn();
    const { result } = renderExport(notify);

    await act(async () => result.current.exportBackup());

    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("warning", "No data to export");
  });

  it("refuses when the registry cannot be read, rather than exporting nothing", async () => {
    componentRepository.load.mockRejectedValue(new Error("registry is broken"));
    const notify = vi.fn();
    const { result } = renderExport(notify);

    await act(async () => result.current.exportBackup());

    expect(servicesModule.buildProjectBackupZip).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("warning", "No data to export");
  });
});
