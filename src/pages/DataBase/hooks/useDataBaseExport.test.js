import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exportToExcelFile: vi.fn(),
  buildInWorker: vi.fn(),
  readSettings: vi.fn(() => ({ setting: true })),
  readRound: vi.fn(() => ({ id: "round-1" })),
  readSync: vi.fn(async () => ({ syncId: "abc" })),
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
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({
    activeProject: { id: "p1", name: "Тенгиз", folderName: "tengiz" },
  }),
}));
vi.mock("@/app/project/hooks/useExcelExportMode", () => ({
  useExcelExportMode: () => ({ monitoringExportMode: "all" }),
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: { gasPercentage: 90 } }),
}));
vi.mock("@/app/project/projectSettings", () => ({
  readProjectSettings: mocks.readSettings,
}));
vi.mock("@/utils/monitoringRound", () => ({
  readMonitoringRound: mocks.readRound,
}));
vi.mock("@/services/sync/projectSyncState", () => ({
  readProjectSyncStateAsync: mocks.readSync,
}));
vi.mock("@/pages/DataBase/excel", () => ({
  exportToExcelFile: mocks.exportToExcelFile,
}));
vi.mock("@/services/excel/excelWorkerClient", () => ({
  buildWorkbookBufferInWorker: mocks.buildInWorker,
}));

const { prepareRows, useDataBaseExport } = await import("./useDataBaseExport");
const { translate } = await import("@/test/translate");

describe("prepareRows", () => {
  it("отдаёт даты числом, а не текстом", () => {
    // Прежде их прогоняли через Intl и разбирали обратно: при английском
    // интерфейсе 9 октября уезжало как 10/09 и читалось как 10 сентября.
    // Каждое число до двенадцатого менялось местами с месяцем.
    const [row] = prepareRows([{ id: 1, date: 1_760_000_000_000 }], translate);

    expect(row.date).toBe(1_760_000_000_000);
    expect(typeof row.date).toBe("number");
  });

  it("берёт дату создания, когда своей нет, и пустоту, когда нет обеих", () => {
    const [withCreated] = prepareRows(
      [{ created_at: "1760000000000" }],
      translate,
    );
    expect(withCreated.date).toBe(1_760_000_000_000);

    const [without] = prepareRows([{ id: 2 }], translate);
    expect(without.date).toBe("");
  });

  it("превращает снимки в отметку, а не в путь к файлу", () => {
    const [row] = prepareRows(
      [{ photo: "idb://1", photo_after: null, photo_repair: "idb://2" }],
      translate,
    );

    expect(row.photo).toBe("Yes");
    expect(row.photo_after).toBe("");
    expect(row.photo_repair).toBe("Yes");
  });

  it("округляет расчётные величины до сотых, не трогая нечисловое", () => {
    const [row] = prepareRows(
      [
        {
          Total_Annual_Methane_Loss_m3_y: 1234.5678,
          Emissions_t_CO2eq_year: "—",
        },
      ],
      translate,
    );

    expect(row.Total_Annual_Methane_Loss_m3_y).toBe(1234.57);
    expect(row.Emissions_t_CO2eq_year).toBe("—");
  });

  it("восстанавливает дату ремонта по истории, если её не записали", () => {
    const [row] = prepareRows(
      [
        {
          history: [
            { action: "status_changed", to: "in_progress", date: "2026-01-01" },
            { action: "comment", date: "2026-02-01" },
            { action: "status_changed", to: "in_progress", date: "2026-03-01" },
          ],
        },
      ],
      translate,
    );

    // Берётся последний переход в ремонт, а не первый.
    expect(row.repairAt).toBe("2026-03-01");
  });

  it("записанная дата ремонта важнее выведенной из истории", () => {
    const [row] = prepareRows(
      [
        {
          repairAt: "2026-05-05",
          history: [
            { action: "status_changed", to: "in_progress", date: "2026-01-01" },
          ],
        },
      ],
      translate,
    );

    expect(row.repairAt).toBe("2026-05-05");
  });

  it("без ремонта в истории оставляет пусто, а не выдумывает дату", () => {
    const [row] = prepareRows([{ history: [] }], translate);

    expect(row.repairAt).toBe("");
    expect(row.resolvedAt).toBe("");
  });
});

describe("useDataBaseExport", () => {
  const displayed = [{ id: 1, leak_id: "1", status: "open" }];
  let notify;

  function setup() {
    notify = vi.fn();
    const { result } = renderHook(() =>
      useDataBaseExport({ displayed, notify }),
    );
    return result;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportToExcelFile.mockResolvedValue({ message: "готово" });
    mocks.readSync.mockResolvedValue({ syncId: "abc" });
  });

  it("кладёт в архив ровно то, что на экране", async () => {
    // Отфильтрованная выгрузка не должна тайком тащить скрытые записи и их
    // фотографии.
    const result = setup();

    await act(async () => {
      await result.current.handleExport();
    });

    const options = mocks.exportToExcelFile.mock.calls[0].at(-1);
    expect(options.backupLeaks).toBe(displayed);
    expect(options.buildWorkbookBuffer).toBe(mocks.buildInWorker);
  });

  it("сообщает об успехе и отпускает кнопку", async () => {
    const result = setup();

    await act(async () => {
      await result.current.handleExport();
    });

    expect(notify).toHaveBeenLastCalledWith("success", "готово");
    expect(result.current.isExporting).toBe(false);
  });

  it("сообщает об ошибке, не оставляя кнопку нажатой", async () => {
    mocks.exportToExcelFile.mockRejectedValue(new Error("нет места"));
    const result = setup();

    await act(async () => {
      await result.current.handleExport();
    });

    expect(notify).toHaveBeenLastCalledWith(
      "error",
      expect.stringContaining("нет места"),
    );
    expect(result.current.isExporting).toBe(false);
  });

  it("не запускает вторую выгрузку поверх первой", async () => {
    let release;
    mocks.exportToExcelFile.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    const result = setup();

    let first;
    act(() => {
      first = result.current.handleExport();
    });
    await act(async () => {
      await result.current.handleExport();
    });

    expect(mocks.exportToExcelFile).toHaveBeenCalledOnce();

    await act(async () => {
      release({ message: "готово" });
      await first;
    });
  });
});
