import { describe, expect, it } from "vitest";
import {
  normalizeHistoryCellValue,
  parseHistoryRecords,
  parseMonitoringRecords,
} from "./sheetRecordParsers";

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
        getCell(columnNumber) {
          return { value: values[columnNumber - 1] };
        },
      };
    },
  };
}

function createValidationSpy() {
  const warnings = [];
  return {
    warnings,
    add(...warning) {
      warnings.push(warning);
    },
  };
}

describe("Excel monitoring and history sheet parsers", () => {
  it("parses monitoring rows, combines time, and preserves photo hyperlinks", () => {
    const sheet = makeSheet("Мониторинг", [
      [
        "Бирка",
        "Обход",
        "Дата мониторинга",
        "Время",
        "Кто мониторил",
        "Результат",
        "МТР",
        "Комментарий",
        "Фото мониторинга",
      ],
      [
        "TAG-1",
        2,
        "01.08.2026",
        "14:30",
        "Inspector",
        "Нет",
        "Materials",
        "Resolved",
        { hyperlink: "photos/monitoring.jpg", text: "Photo" },
      ],
    ]);

    const result = parseMonitoringRecords(sheet);
    const record = result.recordsByLeakId.get("tag-1")[0];
    const date = new Date(record.date);

    expect(result.count).toBe(1);
    expect(record).toMatchObject({
      id: "excel-TAG-1-round-2-2",
      roundId: "excel-round-2",
      roundNumber: 2,
      monitoredBy: "Inspector",
      result: "resolved",
      materials_equipment: "Materials",
      comment: "Resolved",
      photo: "zip:photos/monitoring.jpg",
    });
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 7, 1,
    ]);
    expect([date.getHours(), date.getMinutes()]).toEqual([14, 30]);
  });

  it("warns about unknown results and skips incomplete monitoring rows", () => {
    const validation = createValidationSpy();
    const sheet = makeSheet("Monitoring", [
      ["Leak ID", "Monitoring date", "Result"],
      ["TAG-1", "01.08.2026", "Unexpected"],
      ["TAG-2", "", "resolved"],
    ]);

    const result = parseMonitoringRecords(sheet, validation);

    expect(result.count).toBe(1);
    expect(result.recordsByLeakId.get("tag-1")[0].result).toBe("still_leaking");
    expect(validation.warnings).toHaveLength(2);
    expect(validation.warnings[0][4]).toContain("Неизвестный результат");
    expect(validation.warnings[1][4]).toContain("Строка мониторинга пропущена");
  });

  it("parses history actions, statuses, times, and JSON changes", () => {
    const changes = [{ field: "status", from: "open", to: "resolved" }];
    const sheet = makeSheet("History", [
      [
        "Leak ID",
        "Date",
        "Time",
        "Action",
        "User",
        "Text",
        "Status",
        "Changes JSON",
      ],
      [
        "TAG-1",
        "31.07.2026",
        "09:15",
        "Статус изменён",
        "Inspector",
        "Fixed",
        "Закрыто",
        JSON.stringify(changes),
      ],
    ]);

    const result = parseHistoryRecords(sheet);
    const record = result.recordsByLeakId.get("tag-1")[0];
    const date = new Date(record.date);

    expect(result.count).toBe(1);
    expect(record).toMatchObject({
      action: "status_changed",
      user: "Inspector",
      text: "Fixed",
      to: "resolved",
      changes,
    });
    expect([date.getHours(), date.getMinutes()]).toEqual([9, 15]);
  });

  it("rejects invalid change payloads and sheets without recognizable headers", () => {
    expect(normalizeHistoryCellValue("changes", "invalid JSON")).toEqual([]);
    expect(normalizeHistoryCellValue("changes", '{"field":"status"}')).toEqual(
      [],
    );

    const result = parseHistoryRecords(
      makeSheet("Unknown", [
        ["First", "Second"],
        ["A", "B"],
      ]),
    );
    expect(result.count).toBe(0);
    expect(result.recordsByLeakId.size).toBe(0);
  });
});
