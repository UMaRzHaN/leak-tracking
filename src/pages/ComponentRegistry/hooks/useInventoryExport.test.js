import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isNative: false }));
const mocks = vi.hoisted(() => ({
  buildSheetSpec: vi.fn(),
  buildArchive: vi.fn(),
  buildRegistryEntry: vi.fn(),
  buildSchemaEntries: vi.fn(),
  readIndex: vi.fn(),
  readSchemaFile: vi.fn(),
  writePublicFile: vi.fn(),
}));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ getPhoto: vi.fn() }),
}));
vi.mock("@/utils/platform", () => ({
  get isNative() {
    return state.isNative;
  },
}));
vi.mock("@/services/inventory/inventoryArchive", () => ({
  buildInventoryArchive: mocks.buildArchive,
  buildInventoryFileStem: (name) => `!Inventorization_${name}`,
  INVENTORY_PHOTO_DIR: "photos",
  INVENTORY_SCHEMA_DIR: "schemas",
}));
vi.mock("@/services/excelExport/componentSheetSpec", () => ({
  buildComponentSheetSpec: mocks.buildSheetSpec,
}));
vi.mock("@/services/backup/componentArchive", () => ({
  buildComponentArchiveEntry: mocks.buildRegistryEntry,
}));
vi.mock("@/services/backup/schemaArchive", () => ({
  buildSchemaArchiveEntries: mocks.buildSchemaEntries,
}));
vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: {
    // Весь список, вместе с надгробиями удалённых схем.
    readIndex: mocks.readIndex,
    readSchemaFile: mocks.readSchemaFile,
  },
}));
vi.mock("@/services/excelExport/exportTexts", () => ({
  buildExcelExportTexts: () => ({ base: true }),
}));
vi.mock("@/services/storage/publicFileWriter", () => ({
  writePublicFile: mocks.writePublicFile,
}));
vi.mock("@/services/storage/exportFolders", () => ({
  INVENTORY_EXPORT_DIR: "Inventory",
  projectExportFolder: (folderName, dir) => `LeakReports/${folderName}/${dir}`,
}));

const { useInventoryExport } = await import("./useInventoryExport");

const project = { id: "p1", name: "Бузахур", folderName: "buzahur" };

let click;

function setup(overrides = {}) {
  const notify = vi.fn();
  const { result } = renderHook(() =>
    useInventoryExport({ project, notify, ...overrides }),
  );
  return { result, notify };
}

describe("useInventoryExport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.isNative = false;
    mocks.buildSheetSpec.mockResolvedValue({ headers: [], rows: [] });
    mocks.buildRegistryEntry.mockResolvedValue(null);
    mocks.buildSchemaEntries.mockResolvedValue([]);
    mocks.readIndex.mockResolvedValue([]);
    mocks.buildArchive.mockResolvedValue(new Blob(["zip"]));
    globalThis.URL.createObjectURL = vi.fn(() => "blob:inventory");
    globalThis.URL.revokeObjectURL = vi.fn();
    // Скачивание в браузере — это клик по невидимой ссылке; jsdom считает его
    // переходом на другой документ и пишет об этом в каждом тесте. Шум в
    // выводе прячет настоящие предупреждения, поэтому клик подменяется всегда,
    // а не только там, где он проверяется.
    click = vi
      .spyOn(globalThis.HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => click.mockRestore());

  it("отдаёт архив на скачивание и сообщает имя файла", async () => {
    const { result, notify } = setup();

    await act(async () => {
      await result.current.exportInventory();
    });

    expect(mocks.buildArchive).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenLastCalledWith(
      "success",
      expect.stringContaining("!Inventorization_Бузахур.zip"),
    );
    expect(result.current.isExporting).toBe(false);
  });

  it("на телефоне кладёт архив в свою папку, а не рядом с отчётами", async () => {
    // Оба файла — зипы с длинным именем; различают их по месту.
    state.isNative = true;
    const { result, notify } = setup();

    await act(async () => {
      await result.current.exportInventory();
    });

    expect(mocks.writePublicFile).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "LeakReports/buzahur/Inventory",
        fileName: "!Inventorization_Бузахур.zip",
        mimeType: "application/zip",
      }),
    );
    expect(notify).toHaveBeenLastCalledWith(
      "success",
      expect.stringContaining("LeakReports/buzahur/Inventory"),
    );
  });

  it("на пустом реестре предупреждает и ничего не собирает", async () => {
    mocks.buildSheetSpec.mockResolvedValue(null);
    const { result, notify } = setup();

    await act(async () => {
      await result.current.exportInventory();
    });

    expect(notify).toHaveBeenLastCalledWith("warning", expect.any(String));
    expect(mocks.buildArchive).not.toHaveBeenCalled();
  });

  it("выгружает реестр и без чертежей, если их не прочитать", async () => {
    // Чертежи — приложение к реестру, а не его условие.
    mocks.readIndex.mockRejectedValue(new Error("нет доступа"));
    const { result } = setup();

    await act(async () => {
      await result.current.exportInventory();
    });

    expect(mocks.buildSchemaEntries).toHaveBeenCalledWith(
      project,
      [],
      expect.any(Function),
      { dir: "schemas" },
    );
    expect(mocks.buildArchive).toHaveBeenCalledOnce();

    // Чтение файла чертежа отдано наружу функцией — проверяем, что она ведёт
    // в хранилище, а не в пустоту.
    const [, , readFile] = mocks.buildSchemaEntries.mock.calls[0];
    readFile(project, { id: "s1" });
    expect(mocks.readSchemaFile).toHaveBeenCalledWith(project, { id: "s1" });
  });

  it("отпускает ссылку на скачанный архив, а не держит его в памяти", async () => {
    // Blob живёт, пока жива ссылка; архив реестра — это мегабайты снимков.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = setup();

    await act(async () => {
      await result.current.exportInventory();
    });
    expect(globalThis.URL.revokeObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:inventory",
    );
    vi.useRealTimers();
  });

  it("сообщает об ошибке и отпускает кнопку", async () => {
    mocks.buildArchive.mockRejectedValue(new Error("диск полон"));
    const { result, notify } = setup();

    await act(async () => {
      await result.current.exportInventory();
    });

    expect(notify).toHaveBeenLastCalledWith(
      "error",
      expect.stringContaining("диск полон"),
    );
    expect(result.current.isExporting).toBe(false);
  });

  it("не собирает второй архив, пока не закончен первый", async () => {
    let release;
    mocks.buildArchive.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    const { result } = setup();

    let first;
    act(() => {
      first = result.current.exportInventory();
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    await act(async () => {
      await result.current.exportInventory();
    });
    expect(mocks.buildArchive).toHaveBeenCalledOnce();

    await act(async () => {
      release(new Blob(["zip"]));
      await first;
    });
  });

  it("без проекта не делает ничего", async () => {
    const { result, notify } = setup({ project: null });

    await act(async () => {
      await result.current.exportInventory();
    });

    expect(notify).not.toHaveBeenCalled();
  });
});
