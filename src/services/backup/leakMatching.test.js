import { describe, expect, it } from "vitest";
import { matchIncomingLeaks } from "./leakMatching";
import { mergeLeaksByFreshness } from "./leakMergeEngine";
import { filterIncomingLeaksForMerge, previewMergeLeaks } from "./mergePreview";

const leak = (id, component, updatedAt = 100) => ({
  id,
  leak_id: "3830",
  component,
  status: "open",
  updatedAt,
});

describe("сопоставление утечек при объединении", () => {
  it("не склеивает две утечки с одним номером", () => {
    // Так было в поле: дубль номера 3830 превращался в копию настоящей 3830.
    const existing = [leak("real", "Задвижка"), leak("twin", "Фланец")];
    const incoming = [
      leak("real", "Задвижка", 200),
      leak("twin", "Фланец, поправлен", 200),
    ];

    const result = mergeLeaksByFreshness(existing, incoming, {
      source: "archive",
    });

    expect(result).toMatchObject({ added: 0, updated: 2 });
    expect(result.leaks.map((item) => [item.id, item.component])).toEqual([
      ["real", "Задвижка"],
      ["twin", "Фланец, поправлен"],
    ]);
    expect(previewMergeLeaks(existing, incoming)).toMatchObject({
      added: 0,
      updated: 2,
    });
  });

  it("добавляет дубль номера, которого на устройстве нет", () => {
    const existing = [leak("real", "Задвижка")];
    const incoming = [
      leak("real", "Задвижка", 200),
      leak("twin", "Фланец", 200),
    ];

    const result = mergeLeaksByFreshness(existing, incoming);

    expect(result).toMatchObject({ added: 1, updated: 1 });
    expect(result.leaks.map((item) => item.component)).toEqual([
      "Задвижка",
      "Фланец",
    ]);
  });

  it("добавляет оба дубля, если номера на устройстве не было", () => {
    const result = mergeLeaksByFreshness(
      [],
      [leak("real", "Задвижка"), leak("twin", "Фланец")],
    );

    expect(result.added).toBe(2);
    expect(result.leaks).toHaveLength(2);
  });

  it("не отдаёт по номеру утечку, чья пара отсеяна до слияния", () => {
    // Импорт архива сначала отбрасывает то, что не свежее местного, и уже
    // остаток сливает. Своя пара у местной «real» есть — просто не дошла.
    const existing = [leak("real", "Задвижка", 300)];
    const archive = [leak("real", "Задвижка", 100), leak("twin", "Фланец")];
    const applying = filterIncomingLeaksForMerge(existing, archive, {
      source: "archive",
    });

    const result = mergeLeaksByFreshness(existing, applying, {
      source: "archive",
      allIncoming: archive,
    });

    expect(applying.map((item) => item.id)).toEqual(["twin"]);
    expect(result).toMatchObject({ added: 1, updated: 0 });
    expect(result.leaks[0].component).toBe("Задвижка");
  });

  it("сводит по номеру по порядку, когда `id` назначены заново", () => {
    // Книга Excel: у строк свежие `id`, узнать утечку можно только по номеру.
    const existing = [leak("a", "Задвижка"), leak("b", "Фланец")];
    const incoming = [leak("excel-1", "Задвижка"), leak("excel-2", "Фланец")];

    expect(matchIncomingLeaks(existing, incoming, { source: "excel" })).toEqual(
      [0, 1],
    );
  });

  it("узнаёт номер без учёта регистра и пробелов", () => {
    expect(
      matchIncomingLeaks(
        [{ id: "a", leak_id: "TAG-1" }],
        [{ id: "b", leak_id: " tag-1 " }],
      ),
    ).toEqual([0]);
  });

  it("при синхронизации опознаёт только по `id`", () => {
    expect(
      matchIncomingLeaks(
        [leak("real", "Задвижка")],
        [leak("other", "Задвижка")],
        { source: "sync" },
      ),
    ).toEqual([-1]);
  });
});
