import { describe, expect, it } from "vitest";
import { prepareExcelLeaks } from "./excelLeakPreparation";

describe("prepareExcelLeaks", () => {
  it("не склеивает при слиянии две утечки с одним номером", () => {
    // В поле встречаются две утечки с одним номером. Словарь «номер →
    // утечка» оставлял последнюю, и обе строки книги получали её id.
    const existing = [
      { id: "a", leak_id: "17", index: 1 },
      { id: "b", leak_id: "17", index: 2 },
    ];
    const rows = [
      { leak_id: "17", note: "первая" },
      { leak_id: "17", note: "вторая" },
    ];

    const prepared = prepareExcelLeaks(existing, rows, {
      mode: "merge",
      now: 1000,
    });

    expect(prepared.map((leak) => leak.id)).toEqual(["a", "b"]);
    expect(prepared.map((leak) => leak.index)).toEqual([1, 2]);
  });

  it("узнаёт утечку по id, если номер у неё поправили", () => {
    const existing = [{ id: "a", leak_id: "17", index: 1 }];
    const prepared = prepareExcelLeaks(
      existing,
      [{ id: "a", leak_id: "17-А" }],
      { mode: "merge", now: 1000 },
    );
    expect(prepared[0].id).toBe("a");
  });

  it("новой строке даёт новый id и место в конце", () => {
    const prepared = prepareExcelLeaks(
      [{ id: "a", leak_id: "17", index: 1 }],
      [{ leak_id: "18" }],
      { mode: "merge", now: 1000 },
    );
    expect(prepared[0]).toMatchObject({
      id: 1000,
      index: 2,
      importedFromExcel: true,
      importedAt: 1000,
    });
  });

  it("вне слияния местные утечки не ищет", () => {
    const prepared = prepareExcelLeaks(
      [{ id: "a", leak_id: "17", index: 1 }],
      [{ leak_id: "17" }],
      { mode: "overwrite", now: 1000 },
    );
    expect(prepared[0]).toMatchObject({ id: 1000, index: 1 });
  });
});
