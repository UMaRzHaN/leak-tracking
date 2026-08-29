import { describe, expect, it } from "vitest";
import { mergeRecordArray } from "./recordArrayMerge";

describe("project backup nested record merge", () => {
  it("matches monitoring records by id and preserves the local id", () => {
    const result = mergeRecordArray(
      [{ id: "local", date: "2026-08-01T08:00:00Z", result: "open" }],
      [{ id: "local", date: "2026-08-01T09:00:00Z", result: "resolved" }],
      "monitoringRecords",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "local", result: "resolved" });
  });

  it("uses a calendar-day fallback for date-only Excel rows", () => {
    const result = mergeRecordArray(
      [{ date: "2026-08-01T10:30:00", roundNumber: 1, result: "open" }],
      [{ date: "01.08.2026", roundNumber: 1, result: "resolved" }],
      "monitoringRecords",
      { source: "excel" },
    );

    expect(result).toHaveLength(1);
    expect(result[0].result).toBe("resolved");
  });
  describe("одно событие под двумя идентификаторами", () => {
    // Идентификатор записи мониторинга зависит от того, где её завели:
    // приложение пишет `<id утечки>-<время>`, разбор листа Excel —
    // `excel-<тег>-round-<N>-<строка>`. Проект попадает на телефоны обоими
    // путями, и при обмене архивом один и тот же обход приезжал дважды.
    const appRecord = {
      id: "leak-1-1772446500000",
      date: "2026-03-02T10:15:00.000Z",
      roundId: "round-1772446500000",
      roundNumber: 1,
      monitoredBy: "Инспектор",
      result: "still_leaking",
    };
    const sameEventFromExcel = {
      id: "excel-TAG-7-round-1-5",
      date: "2026-03-02T10:15:00.000Z",
      roundId: "excel-round-1",
      roundNumber: 1,
      monitoredBy: "Инспектор",
      result: "still_leaking",
    };

    it("узнаётся по времени и обходу при обмене архивом", () => {
      const result = mergeRecordArray(
        [appRecord],
        [sameEventFromExcel],
        "monitoringRecords",
      );

      expect(result).toHaveLength(1);
      // Идентификатор остаётся местный: на него ссылается всё, что уже есть
      // на этом телефоне.
      expect(result[0]).toMatchObject({
        id: "leak-1-1772446500000",
        roundId: "round-1772446500000",
      });
    });

    it("две настоящие проверки одного обхода не сливаются в одну", () => {
      // Повторная проверка в том же обходе — обычное дело; отличает их время.
      const recheck = {
        ...appRecord,
        id: "leak-1-1772450100000",
        date: "2026-03-02T11:15:00.000Z",
      };

      const result = mergeRecordArray(
        [appRecord],
        [recheck],
        "monitoringRecords",
      );

      expect(result).toHaveLength(2);
    });

    it("совпадение времени в разных обходах не считается одним событием", () => {
      const otherRound = { ...sameEventFromExcel, roundNumber: 2 };

      const result = mergeRecordArray(
        [appRecord],
        [otherRound],
        "monitoringRecords",
      );

      expect(result).toHaveLength(2);
    });

    it("запись без читаемой даты не приклеивается к чужой", () => {
      const undated = { id: "excel-TAG-7-round-1-9", date: "", roundNumber: 1 };
      const alsoUndated = { ...appRecord, date: "" };

      const result = mergeRecordArray(
        [alsoUndated],
        [undated],
        "monitoringRecords",
      );

      expect(result).toHaveLength(2);
    });
  });
});
