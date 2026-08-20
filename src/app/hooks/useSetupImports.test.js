import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rollback: vi.fn(),
  registryTypes: vi.fn(() => ["upstream"]),
  loadRegistry: vi.fn(),
  importInventory: vi.fn(),
  parseExcel: vi.fn(),
  detectType: vi.fn(),
  importZip: vi.fn(),
}));

vi.mock("@/services/backup/projectCleanup", () => ({
  rollbackImportedProject: mocks.rollback,
}));
vi.mock("@/configs/projectAdapter", () => ({
  componentRegistryProjectTypes: mocks.registryTypes,
  loadComponentRegistry: mocks.loadRegistry,
}));
vi.mock("@/services/inventory/inventoryImport", () => ({
  importInventoryFile: mocks.importInventory,
}));
vi.mock("@/services/import/excelImportService", () => ({
  parseExcelImportFile: mocks.parseExcel,
}));
vi.mock("@/services/backup/projectBackupService", () => ({
  importProjectZip: mocks.importZip,
  detectProjectTypeFromLeaks: mocks.detectType,
}));

const { useSetupImports } = await import("./useSetupImports");

const file = () => new File(["x"], "!Inventorization_Buzahur.zip");

function setup() {
  const activeProjectIdRef = { current: "existing" };
  const deps = {
    // Наложение поверх экрана здесь ничего не решает — прокидываем как есть.
    runWithImportOverlay: vi.fn((run) => run()),
    stableImportCtx: { ctx: true },
    activeProjectIdRef,
    saveRef: { current: vi.fn().mockResolvedValue(undefined) },
    addProject: vi.fn((name, type) => {
      const project = { id: "new", name, type, folderName: "new" };
      // Заведение проекта делает его активным — на это опирается ожидание ref.
      activeProjectIdRef.current = project.id;
      return project;
    }),
    removeProject: vi.fn(),
    overwriteProject: vi.fn(),
    clearForm: vi.fn(),
    handleCreateExcelCopy: vi.fn().mockResolvedValue({ project: { id: "x" } }),
  };
  const { result } = renderHook(() => useSetupImports(deps));
  return { api: result.current, deps, activeProjectIdRef };
}

describe("useSetupImports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.registryTypes.mockReturnValue(["upstream"]);
    mocks.loadRegistry.mockResolvedValue([]);
    mocks.importInventory.mockResolvedValue({ added: 3, updated: 0 });
    mocks.rollback.mockResolvedValue({ cleanupComplete: true });
  });

  describe("инвентаризация", () => {
    it("заводит проект и сообщает, сколько карточек внесено", async () => {
      const { api, deps } = setup();

      const result = await api.handleSetupImportInventory(file(), {
        name: "Бузахур",
      });

      expect(deps.addProject).toHaveBeenCalledWith("Бузахур", "upstream");
      expect(result).toMatchObject({ leakCount: 0, components: 3 });
      // Утечек в таком архиве нет, и это не ошибка: обход железа начинается
      // раньше, чем находят первую утечку.
      expect(deps.saveRef.current).toHaveBeenCalledWith([]);
      expect(deps.removeProject).not.toHaveBeenCalled();
    });

    it("не заводит проект, когда тип определить не из чего", async () => {
      mocks.registryTypes.mockReturnValue(["upstream", "midstream"]);
      const { api, deps } = setup();

      await expect(
        api.handleSetupImportInventory(file(), { name: "Бузахур" }),
      ).rejects.toMatchObject({ code: "MISSING_PROJECT_TYPE" });
      expect(deps.addProject).not.toHaveBeenCalled();
    });

    it("откатывает заведённый проект, если импорт не сложился", async () => {
      // Иначе на первом экране остаётся пустой проект, которого человек не
      // заводил, а прежний перестаёт быть активным.
      mocks.importInventory.mockRejectedValue(new Error("архив повреждён"));
      const { api, deps } = setup();

      await expect(
        api.handleSetupImportInventory(file(), { name: "Бузахур" }),
      ).rejects.toThrow("архив повреждён");

      expect(mocks.rollback).toHaveBeenCalledWith(
        expect.objectContaining({ id: "new" }),
        deps.removeProject,
      );
      expect(deps.overwriteProject).toHaveBeenCalledWith("existing");
    });

    it("считает пустую инвентаризацию неудачей и тоже откатывает", async () => {
      mocks.importInventory.mockResolvedValue({ added: 0, updated: 0 });
      const { api } = setup();

      await expect(
        api.handleSetupImportInventory(file(), { name: "Бузахур" }),
      ).rejects.toMatchObject({ code: "EMPTY_INVENTORY" });
      expect(mocks.rollback).toHaveBeenCalled();
    });

    it("доносит незавершённую уборку вместе с исходной ошибкой", async () => {
      // Не заменяет её: человеку важнее, почему не встал импорт, а следы на
      // диске — вопрос второй, но потерять его нельзя.
      const cleanupError = new Error("папку не удалить");
      mocks.importInventory.mockRejectedValue(new Error("архив повреждён"));
      mocks.rollback.mockResolvedValue({
        cleanupComplete: false,
        cleanupError,
      });
      const { api } = setup();

      await expect(
        api.handleSetupImportInventory(file(), { name: "Бузахур" }),
      ).rejects.toMatchObject({
        message: "архив повреждён",
        rollbackCleanupError: cleanupError,
      });
    });
  });

  describe("XLSX", () => {
    it("берёт имя и тип из файла, когда он их знает", async () => {
      mocks.parseExcel.mockResolvedValue({
        leaks: [{ id: 1 }],
        project: { name: "Тенгиз", type: "midstream", syncId: "abc" },
      });
      const { api, deps } = setup();

      await api.handleSetupImportExcel(new File(["x"], "report.xlsx"), {
        name: "введённое",
        type: null,
      });

      expect(deps.handleCreateExcelCopy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Тенгиз",
          type: "midstream",
          syncId: "abc",
        }),
      );
      expect(mocks.detectType).not.toHaveBeenCalled();
    });

    it("определяет тип по самим утечкам, если файл о нём молчит", async () => {
      mocks.parseExcel.mockResolvedValue({ leaks: [{ id: 1 }], project: null });
      mocks.detectType.mockReturnValue("downstream");
      const { api, deps } = setup();

      await api.handleSetupImportExcel(new File(["x"], "report.xlsx"), {
        name: "Омск",
        type: null,
      });

      expect(deps.handleCreateExcelCopy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Омск", type: "downstream" }),
      );
    });

    it("отказывает файлу без единой пригодной строки", async () => {
      mocks.parseExcel.mockResolvedValue({ leaks: [], portableArchive: null });
      const { api, deps } = setup();

      await expect(
        api.handleSetupImportExcel(new File(["x"], "report.xlsx"), {}),
      ).rejects.toMatchObject({ code: "EMPTY_EXCEL" });
      expect(deps.handleCreateExcelCopy).not.toHaveBeenCalled();
    });
  });

  it("передаёт ZIP-бэкапу общий контекст импорта и запасные метаданные", async () => {
    mocks.importZip.mockResolvedValue({ project: { id: "z" } });
    const { api } = setup();

    await api.handleSetupImportZip(new File(["x"], "backup.zip"), {
      name: "старый архив",
    });

    expect(mocks.importZip).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        ctx: true,
        metaFallback: { name: "старый архив" },
      }),
    );
  });
});
