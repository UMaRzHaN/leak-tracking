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
    expect(normalizeHeader("  №_Населённый/пункт (%) ")).toBe(
      "населенный пункт",
    );
  });

  it("builds maps from technical keys, aliases, and project configuration", () => {
    const generic = buildHeaderMap("unknown");
    const upstream = buildHeaderMap("upstream");

    expect(generic.get(normalizeHeader("leak_id"))).toBe("leak_id");
    expect(generic.get(normalizeHeader("Индивидуальный номер бирки"))).toBe(
      "leak_id",
    );
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
