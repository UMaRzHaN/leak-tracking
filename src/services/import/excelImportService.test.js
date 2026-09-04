import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/import/excelImportParse", () => ({
  parseExcelImportFile: vi.fn(),
  parseExcelLeaks: vi.fn(),
}));
vi.mock("@/services/excel/excelWorkerClient", () => ({
  buildWorkbookBufferInWorker: vi.fn(),
  parseExcelImportFileInWorker: vi.fn(),
  isWorkerUnavailableError: (error) => error?.name === "WorkerUnavailableError",
}));

const { parseExcelImportFile } = await import("./excelImportService");
const { parseExcelImportFile: parseLocally } =
  await import("@/services/import/excelImportParse");
const { parseExcelImportFileInWorker } =
  await import("@/services/excel/excelWorkerClient");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseExcelImportFile routing", () => {
  it("uses the worker result and never parses locally", async () => {
    parseExcelImportFileInWorker.mockResolvedValue({ leaks: ["worker"] });

    await expect(parseExcelImportFile("file")).resolves.toEqual({
      leaks: ["worker"],
    });
    expect(parseLocally).not.toHaveBeenCalled();
  });

  /*
   * Запасного разбора на главном потоке больше нет: он держал в графе
   * приложения вторую копию ExcelJS. Отказ воркера доходит до человека как
   * отказ, а не как молча подвисший интерфейс.
   */
  it("surfaces an unavailable worker instead of parsing locally", async () => {
    const unavailable = new Error("no workers");
    unavailable.name = "WorkerUnavailableError";
    parseExcelImportFileInWorker.mockRejectedValue(unavailable);

    await expect(parseExcelImportFile("file", { a: 1 })).rejects.toThrow(
      "no workers",
    );
    expect(parseLocally).not.toHaveBeenCalled();
  });

  it("does not reparse a file the worker rejected", async () => {
    parseExcelImportFileInWorker.mockRejectedValue(
      new Error("В ZIP не найден Excel-файл .xlsx"),
    );

    await expect(parseExcelImportFile("file")).rejects.toThrow("не найден");
    expect(parseLocally).not.toHaveBeenCalled();
  });
});
