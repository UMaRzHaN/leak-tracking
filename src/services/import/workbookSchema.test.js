import { describe, expect, it } from "vitest";
import {
  buildHeaderMap,
  buildHistoryHeaderMap,
  buildMonitoringHeaderMap,
  findHeaderRow,
  findHistorySheet,
  findLeakSheet,
  findMonitoringSheet,
  getCellDisplayValue,
  getCellPhotoValue,
  normalizeHeader,
} from "./workbookSchema";

function makeSheet(name, rows) {
  return {
    name,
    rowCount: rows.length,
    getRow(rowNumber) {
      const values = rows[rowNumber - 1] ?? [];
      return {
        eachCell(_options, callback) {
          values.forEach((value, index) => {
            if (value != null && value !== "") {
              callback({ value }, index + 1);
            }
          });
        },
      };
    },
  };
}

describe("Excel workbook schema discovery", () => {
  it("normalizes punctuation, spacing, underscores, and the letter ё", () => {
    expect(normalizeHeader("  _Населённый/пункт (%) ")).toBe(
      "населенный пункт",
    );
  });

  /*
   * `№` разворачивается в слово, а не вычёркивается: вычеркнутый, он оставлял
   * от заголовка «№» пустую строку, и колонка номера в карте заголовков
   * становилась неотличима от пустой ячейки.
   */
  it("turns № into a word instead of dropping it", () => {
    expect(normalizeHeader("№")).toBe("номер");
    expect(normalizeHeader("№ бирки")).toBe("номер бирки");
    expect(buildHeaderMap("unknown").get(normalizeHeader("№"))).toBe("index");
  });

  /*
   * Пустая ячейка не заголовок. Пока `№` вычёркивался, псевдоним колонки
   * номера сидел в карте под пустым ключом, любая пустота считалась
   * распознанным заголовком — и строка данных с десятком пустых ячеек
   * обходила настоящую шапку.
   */
  it("never maps a blank cell to a column", () => {
    for (const map of [
      buildHeaderMap("unknown"),
      buildHeaderMap("upstream"),
      buildMonitoringHeaderMap(),
      buildHistoryHeaderMap(),
    ]) {
      expect(map.has("")).toBe(false);
    }
  });

  it("builds maps from technical keys, aliases, and project configuration", () => {
    const generic = buildHeaderMap("unknown");
    const upstream = buildHeaderMap("upstream");

    expect(generic.get(normalizeHeader("leak_id"))).toBe("leak_id");
    expect(generic.get(normalizeHeader("Индивидуальный номер бирки"))).toBe(
      "leak_id",
    );
    /*
     * Как эту колонку подписывают в файлах, сделанных руками: приложение
     * пишет «Индивидуальный номер утечки», а человек за таблицей — как
     * говорит, и такой файл не читался вовсе.
     */
    for (const header of ["Номер бирки", "№ бирки", "Tag number"]) {
      expect(generic.get(normalizeHeader(header))).toBe("leak_id");
    }
    expect(upstream.get(normalizeHeader("Координата X"))).toBe("lat");
    expect(buildMonitoringHeaderMap().get(normalizeHeader("Обход"))).toBe(
      "roundNumber",
    );
    expect(buildHistoryHeaderMap().get(normalizeHeader("Изменения JSON"))).toBe(
      "changes",
    );
  });

  it("extracts display and photo values from Excel cell objects", () => {
    expect(getCellDisplayValue({ value: { result: 42 } })).toBe(42);
    expect(
      getCellDisplayValue({
        value: { richText: [{ text: "Leak" }, { text: " ID" }] },
      }),
    ).toBe("Leak ID");
    expect(
      getCellDisplayValue({
        value: { hyperlink: "https://example.test", text: "Link" },
      }),
    ).toBe("Link");
    expect(
      getCellPhotoValue({
        value: { hyperlink: "photos/leak.jpg", text: "Photo" },
      }),
    ).toBe("photos/leak.jpg");
    expect(getCellDisplayValue(null)).toBe("");
  });

  it("приводит виндовые разделители в путях к фото к ZIP-виду", () => {
    expect(
      getCellPhotoValue({
        value: { hyperlink: "photos\\5502\\before.jpg", text: "Открыть фото" },
      }),
    ).toBe("photos/5502/before.jpg");
    expect(
      getCellPhotoValue({ value: ".\\photos\\5502\\monitoring\\record-1.jpg" }),
    ).toBe("photos/5502/monitoring/record-1.jpg");
    expect(getCellPhotoValue({ value: 42 })).toBe(42);
  });

  it("selects the row with the greatest number of recognized headers", () => {
    const sheet = makeSheet("Data", [
      ["Report", "Unknown"],
      ["Дата обнаружения", "Бирка", "Статус"],
      ["value", "TAG-1", "Открыта"],
    ]);

    expect(findHeaderRow(sheet, buildHeaderMap("upstream"))).toEqual({
      rowNumber: 2,
      recognized: 3,
      columns: [
        { columnNumber: 1, key: "date", header: "Дата обнаружения" },
        { columnNumber: 2, key: "leak_id", header: "Бирка" },
        { columnNumber: 3, key: "status", header: "Статус" },
      ],
    });
    expect(
      findHeaderRow(makeSheet("Invalid", [["Only", "Unknown"]]), new Map()),
    ).toBeNull();
  });

  it("distinguishes leak, monitoring, and history worksheets", () => {
    const monitoring = makeSheet("Мониторинг", [
      ["Бирка", "Обход", "Дата мониторинга"],
    ]);
    const history = makeSheet("Leak History", [["Leak ID", "Action", "Date"]]);
    const leaks = makeSheet("Утечки", [["Бирка", "Дата обнаружения"]]);
    const workbook = { worksheets: [monitoring, history, leaks] };

    expect(findLeakSheet(workbook, buildHeaderMap("upstream"))).toBe(leaks);
    expect(findMonitoringSheet(workbook)).toBe(monitoring);
    expect(findHistorySheet(workbook)).toBe(history);
  });

  it("skips a non-data cover sheet before the actual leak table", () => {
    const cover = makeSheet("README", [["Leak tracking report", "v1"]]);
    const leaks = makeSheet("Data", [
      ["Leak ID", "Detection date", "Status"],
      ["TAG-1", "01.08.2026", "Open"],
    ]);

    expect(
      findLeakSheet({ worksheets: [cover, leaks] }, buildHeaderMap("upstream")),
    ).toBe(leaks);
  });

  /*
   * Строка данных, где половина ячеек пуста, не должна выигрывать у шапки.
   * Здесь пустые ячейки отдаются наружу — так их и отдаёт ExcelJS при
   * `includeEmpty: false`, если ячейка в листе есть, а значения в ней нет, —
   * и раньше каждая такая пустота считалась распознанной колонкой `index`.
   */
  it("does not let a mostly blank data row outrank the header row", () => {
    // Недозаполненная строка шире шапки — так пустых «заголовков» в ней
    // набирается больше, чем в шапке настоящих.
    const rows = [
      ["№", "Индивидуальный номер утечки", "Дата обнаружения", "Статус"],
      ["1", "4727", "", "", "", "", ""],
      ["2", "4728", "", "", "", "", ""],
    ];
    const sheet = {
      name: "Утечки",
      rowCount: rows.length,
      getRow(rowNumber) {
        const values = rows[rowNumber - 1] ?? [];
        return {
          eachCell(_options, callback) {
            values.forEach((value, index) => callback({ value }, index + 1));
          },
        };
      },
    };

    const header = findHeaderRow(sheet, buildHeaderMap("unknown"));
    expect(header?.rowNumber).toBe(1);
    expect(header?.columns.some((column) => column.key === "leak_id")).toBe(
      true,
    );
    expect(
      findLeakSheet({ worksheets: [sheet] }, buildHeaderMap("unknown")),
    ).toBe(sheet);
  });

  it("recognizes monitoring and history sheets by their columns", () => {
    const monitoring = makeSheet("Round data", [
      ["Leak ID", "Round number", "Monitoring date"],
    ]);
    const history = makeSheet("Audit data", [["Leak ID", "Action", "Date"]]);
    const workbook = { worksheets: [monitoring, history] };

    expect(findMonitoringSheet(workbook)).toBe(monitoring);
    expect(findHistorySheet(workbook)).toBe(history);
  });
});
