import { describe, expect, it } from "vitest";
import {
  createNativeSqliteMutation,
  shouldReplaceNativeSqliteDataset,
} from "./nativeSqliteMutation";

describe("native SQLite mutation planner", () => {
  it("creates a bounded upsert/delete transaction", () => {
    const previous = [
      { id: "a", value: 1 },
      { id: "b", value: 1 },
    ];
    const next = [
      { id: "a", value: 2 },
      { id: "c", value: 1 },
    ];

    expect(createNativeSqliteMutation(previous, next)).toEqual({
      upserts: [next[0], next[1]],
      deletedIds: ["b"],
    });
  });

  it("uses replacement when existing records are reordered", () => {
    const previous = [{ id: "a" }, { id: "b" }];
    expect(
      createNativeSqliteMutation(previous, [previous[1], previous[0]]),
    ).toBe(null);
  });

  it("rejects duplicate or missing identifiers", () => {
    expect(createNativeSqliteMutation([], [{ value: 1 }])).toBe(null);
    expect(createNativeSqliteMutation([], [{ id: "a" }, { id: "a" }])).toBe(
      null,
    );
  });

  it("replaces very large changes but keeps ordinary edits incremental", () => {
    expect(
      shouldReplaceNativeSqliteDataset(
        { upserts: Array.from({ length: 1001 }), deletedIds: [] },
        5000,
      ),
    ).toBe(true);
    expect(
      shouldReplaceNativeSqliteDataset(
        { upserts: Array.from({ length: 100 }), deletedIds: [] },
        5000,
      ),
    ).toBe(false);
  });

  it("без дельты отвечает «переписать целиком»", () => {
    // Вызывающие стороны проверяют дельту сами и в эту ветку не заходят, но
    // ответ на «дельты нет» — часть договора: посчитать долю изменённого не от
    // чего, а записать набор целиком всегда можно.
    expect(shouldReplaceNativeSqliteDataset(null, 10)).toBe(true);
    expect(shouldReplaceNativeSqliteDataset(undefined, 0)).toBe(true);
  });
});
