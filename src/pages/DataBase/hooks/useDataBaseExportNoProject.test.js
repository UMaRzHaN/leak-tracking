import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exportToExcelFile: vi.fn(),
  buildInWorker: vi.fn(),
}));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/hooks/useEffectiveProjectConfig", () => ({
  useEffectiveProjectConfig: () => ({
    export: { excel: { headers: ["№"], keysOrder: ["leak_id"] } },
  }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ getPhoto: vi.fn() }),
}));
// Проекта нет: так выглядит выгрузка сразу после сноса активного проекта,
// пока экран ещё жив.
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: null }),
}));
vi.mock("@/app/project/hooks/useExcelExportMode", () => ({
  useExcelExportMode: () => ({ monitoringExportMode: "all" }),
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {} }),
}));
vi.mock("@/app/project/projectSettings", () => ({
  readProjectSettings: vi.fn(() => null),
}));
vi.mock("@/utils/monitoringRound", () => ({
  readMonitoringRound: vi.fn(() => null),
}));
vi.mock("@/services/sync/projectSyncState", () => ({
  readProjectSyncStateAsync: vi.fn(async () => null),
}));
vi.mock("@/pages/DataBase/excel", () => ({
  exportToExcelFile: mocks.exportToExcelFile,
}));
vi.mock("@/services/excel/excelWorkerClient", () => ({
  buildWorkbookBufferInWorker: mocks.buildInWorker,
}));

const { useDataBaseExport } = await import("./useDataBaseExport");

describe("выгрузка без активного проекта", () => {
  const notify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportToExcelFile.mockResolvedValue({});
  });

  it("даёт файлу имя-заглушку и не спрашивает у проекта ничего", async () => {
    const { result } = renderHook(() =>
      useDataBaseExport({ displayed: [{ id: 1, leak_id: "TAG-1" }], notify }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    const [, , , , fileName, , folderName] =
      mocks.exportToExcelFile.mock.calls[0];
    expect(fileName).toBe("!Database_no_name");
    expect(folderName).toBeUndefined();
  });

  it("сообщает об успехе своими словами, когда выгрузка промолчала", async () => {
    // Книга собралась, но своего сообщения не вернула: молчание — не ошибка,
    // и человеку всё равно надо сказать, что всё получилось.
    const { result } = renderHook(() =>
      useDataBaseExport({ displayed: [{ id: 1 }], notify }),
    );

    await act(async () => {
      await result.current.handleExport();
    });

    expect(notify).toHaveBeenCalledWith("success", expect.any(String));
  });
});
