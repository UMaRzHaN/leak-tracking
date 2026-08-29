import { describe, expect, it } from "vitest";
import {
  compareLeakIds,
  compareLeakRecency,
  findLatestLeak,
} from "./leakOrder";

describe("compareLeakIds", () => {
  it("sorts numeric and numeric-string ids numerically", () => {
    const rows = [{ id: "10" }, { id: 2 }, { id: "1" }];
    expect(rows.sort(compareLeakIds).map((row) => row.id)).toEqual([
      "1",
      2,
      "10",
    ]);
  });

  it("sorts non-numeric ids naturally instead of returning NaN", () => {
    const rows = [{ id: "leak-10" }, { id: "leak-2" }, { id: "LEAK-1" }];
    expect(rows.sort(compareLeakIds).map((row) => row.id)).toEqual([
      "LEAK-1",
      "leak-2",
      "leak-10",
    ]);
  });
});

describe("compareLeakRecency", () => {
  const at = (createdAt, id) => ({ id, createdAt });

  // The bug this replaces: ids are random UUIDs for anything added in the app,
  // so ordering by id put a screen headed "last N records" in random order.
  it("puts the newest first whatever the ids are", () => {
    const rows = [
      at("2026-08-09T09:05:00.000Z", "zzz"),
      at("2026-08-09T09:11:00.000Z", "aaa"),
      at("2026-08-09T09:08:00.000Z", "mmm"),
    ];

    expect(rows.sort(compareLeakRecency).map((row) => row.id)).toEqual([
      "aaa",
      "mmm",
      "zzz",
    ]);
  });

  // A record carries whichever shape it was written with.
  it("compares Dates, epoch numbers and ISO strings against each other", () => {
    const rows = [
      { id: "iso", createdAt: "2026-08-09T09:00:00.000Z" },
      { id: "date", createdAt: new Date("2026-08-09T09:02:00.000Z") },
      { id: "epoch", createdAt: Date.UTC(2026, 7, 9, 9, 1) },
    ];

    expect(rows.sort(compareLeakRecency).map((row) => row.id)).toEqual([
      "date",
      "epoch",
      "iso",
    ]);
  });

  it("sinks records with no readable timestamp instead of floating them", () => {
    const rows = [
      { id: "broken", createdAt: "not a date" },
      { id: "dated", createdAt: "2026-08-09T09:00:00.000Z" },
      { id: "missing" },
    ];

    expect(rows.sort(compareLeakRecency)[0].id).toBe("dated");
  });

  it("falls back to the id so equal timestamps keep a stable order", () => {
    const createdAt = "2026-08-09T09:00:00.000Z";
    const rows = [
      { id: "leak-2", createdAt },
      { id: "leak-10", createdAt },
      { id: "leak-1", createdAt },
    ];

    expect(rows.sort(compareLeakRecency).map((row) => row.id)).toEqual([
      "leak-10",
      "leak-2",
      "leak-1",
    ]);
  });
});

describe("findLatestLeak", () => {
  const older = { id: "старая", createdAt: 1_000 };
  const newer = { id: "новая", createdAt: 5_000 };

  it("берёт самую свежую независимо от порядка хранения", () => {
    expect(findLatestLeak([newer, older])).toBe(newer);
    expect(findLatestLeak([older, newer])).toBe(newer);
  });

  it("на пустом списке возвращает ничего", () => {
    expect(findLatestLeak([])).toBeNull();
    expect(findLatestLeak(undefined)).toBeNull();
  });

  it("запись без читаемой даты уступает датированной", () => {
    const undated = { id: "без-даты" };
    expect(findLatestLeak([undated, older])).toBe(older);
    expect(findLatestLeak([older, undated])).toBe(older);
  });
});
