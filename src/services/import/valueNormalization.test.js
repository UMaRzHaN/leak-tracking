import { describe, expect, it } from "vitest";
import { translation as en } from "@/locales/en";
import { translation as ru } from "@/locales/ru";
import {
  isRecognizedMonitoringResult,
  isRecognizedStatus,
  isPhotoCellKey,
  normalizeCellValue,
  normalizeHistoryAction,
  normalizeImportedLeak,
  normalizeMonitoringCellValue,
  normalizeMonitoringResult,
  normalizeStatus,
  parseNumberValue,
} from "./valueNormalization";

describe("Excel import value normalization", () => {
  it("parses localized finite numbers", () => {
    expect(parseNumberValue(" 1 234,5 ")).toBe(1234.5);
    expect(parseNumberValue(42)).toBe(42);
    expect(parseNumberValue(3 / 0)).toBeNull();
    expect(parseNumberValue("not a number")).toBeNull();
    expect(parseNumberValue("")).toBeNull();
  });

  it("recognizes and normalizes leak statuses", () => {
    expect(normalizeStatus("Открыта")).toBe("open");
    expect(normalizeStatus("in_progress")).toBe("in_progress");
    expect(normalizeStatus("Закрыто")).toBe("resolved");
    expect(normalizeStatus("unknown")).toBe("open");
    expect(isRecognizedStatus("в ремонте")).toBe(true);
    expect(isRecognizedStatus("unknown")).toBe(false);
    expect(isRecognizedStatus("")).toBe(true);
  });

  it("recognizes and normalizes monitoring results", () => {
    expect(normalizeMonitoringResult("Да — утечка есть")).toBe("still_leaking");
    expect(normalizeMonitoringResult("under repair")).toBe("needs_recheck");
    expect(normalizeMonitoringResult("Нет — утечки нет")).toBe("resolved");
    expect(normalizeMonitoringResult("unknown")).toBe("still_leaking");
    expect(isRecognizedMonitoringResult("resolved")).toBe(true);
    expect(isRecognizedMonitoringResult("unknown")).toBe(false);
  });

  it("normalizes known history actions and safely falls back for unknown ones", () => {
    expect(normalizeHistoryAction("Запись создана")).toBe("created");
    expect(normalizeHistoryAction("Статус изменён")).toBe("status_changed");
    expect(normalizeHistoryAction("Custom action")).toBe("edited");
    expect(normalizeHistoryAction("")).toBe("edited");
  });

  it("normalizes generic, percentage, date, time, and photo cells", () => {
    expect(isPhotoCellKey("photo_after")).toBe(true);
    expect(isPhotoCellKey("note")).toBe(false);
    expect(normalizeCellValue("gasPercentage", 0.25)).toBe(0.25);
    expect(
      normalizeCellValue("gasPercentage", 0.25, { percentFormatted: true }),
    ).toBe(25);
    expect(normalizeCellValue("date", "2026-08-01T23:00:00Z")).toBe(
      "01.08.2026",
    );
    expect(normalizeCellValue("time", "7:05")).toBe("07:05:00");
    expect(normalizeCellValue("photo", "photos/leak.jpg")).toBe(
      "zip:photos/leak.jpg",
    );
    expect(normalizeCellValue("photo", "https://example.test/leak.jpg")).toBe(
      "",
    );
    expect(normalizeCellValue("note", "  text  ")).toBe("text");
  });

  it("normalizes monitoring-specific cells", () => {
    expect(normalizeMonitoringCellValue("roundNumber", " 2 ")).toBe(2);
    expect(normalizeMonitoringCellValue("result", "утечка устранена")).toBe(
      "resolved",
    );
    expect(normalizeMonitoringCellValue("photo", "photos/round.jpg")).toBe(
      "zip:photos/round.jpg",
    );
    expect(
      normalizeMonitoringCellValue(
        "previousPhoto",
        "photos/round-previous.jpg",
      ),
    ).toBe("zip:photos/round-previous.jpg");
  });

  it("builds a persisted leak and removes invalid coordinates", () => {
    const result = normalizeImportedLeak(
      {
        leak_id: " TAG-1 ",
        date: "01.08.2026",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_100,
        status: "устранена",
        leak_speed: "55,5",
        detectedBy: "Inspector",
        lat: 91,
        lng: -181,
        time: "12:30",
      },
      4,
      2,
    );

    expect(result).toMatchObject({
      id: 1_700_000_000_002,
      created_at: "1700000000000",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_100,
      index: 2,
      status: "resolved",
      leak_id: "TAG-1",
      leak_speed: 55.5,
      priority: "high",
    });
    expect(result).not.toHaveProperty("time");
    expect(result).not.toHaveProperty("lat");
    expect(result).not.toHaveProperty("lng");
    expect(result.history[0].user).toBe("Inspector");
  });

  it("skips rows without meaningful leak data", () => {
    expect(
      normalizeImportedLeak({ status: "open", note: "Only note" }, 1, 1),
    ).toBeNull();
  });

  // Неузнанный статус раньше превращался в `open` — выдуманное значение,
  // которое дальше невозможно отличить от того, что человек так и написал.
  it("не подставляет статус вместо неузнанного значения", () => {
    expect(normalizeCellValue("status", "Открыта")).toBe("open");
    expect(normalizeCellValue("status", "Under repair")).toBe("in_progress");
    expect(normalizeCellValue("status", "")).toBe("");
    expect(normalizeCellValue("status", "нечто неведомое")).toBe("");
  });
});

/**
 * Выгрузка пишет в видимый лист **переведённую подпись**, а импорт разбирает
 * её обратно по таблице соответствий. Таблицы велись руками и от локалей
 * отставали: английское «Under repair» в них не попало, и статус утечки после
 * круга через Excel молча становился «Open» — `normalizeStatus` возвращает
 * `open` на всё неузнанное. У результата обхода было хуже: «No» (утечки нет)
 * превращалось в «Yes».
 *
 * Заметить это могло только что-то, работающее на английском. Единственный
 * такой тест — `large-dataset.perf.spec.js`, он один переключает язык, и он же
 * лежит в том job CI, который ни разу не запускался.
 *
 * Проверка идёт от локалей, а не от списка подписей: любая подпись, которую
 * выгрузка способна написать на любом языке, обязана читаться обратно. Новый
 * язык или переименование подписи ломают этот тест, а не данные пользователя.
 */
describe("подписи из локалей читаются обратно", () => {
  const LANGUAGES = { ru, en };

  const cases = [
    {
      enumName: "статус утечки",
      values: ["open", "in_progress", "resolved"],
      label: (translation, value) => translation.leakDetails.statuses[value],
      normalize: normalizeStatus,
    },
    {
      enumName: "результат обхода",
      values: ["still_leaking", "needs_recheck", "resolved"],
      label: (translation, value) =>
        translation.excelExport.monitoring.answers[value],
      normalize: normalizeMonitoringResult,
    },
  ];

  for (const { enumName, values, label, normalize } of cases) {
    for (const [language, translation] of Object.entries(LANGUAGES)) {
      it(`${enumName}: ${language}`, () => {
        const broken = values
          .map((value) => ({ value, text: label(translation, value) }))
          .filter(({ value, text }) => normalize(text) !== value);
        expect(broken).toEqual([]);
      });
    }
  }
});
