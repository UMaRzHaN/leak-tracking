import { describe, expect, it } from "vitest";
import { matchAll } from "./matchAll";

describe("matchAll", () => {
  it("returns every match with its groups", () => {
    const found = matchAll("a=1 b=2", /(?<key>\w)=(?<value>\d)/g);
    expect(found.map((match) => match.groups.key)).toEqual(["a", "b"]);
    expect(found.map((match) => match.groups.value)).toEqual(["1", "2"]);
  });

  it("returns nothing when the pattern does not match", () => {
    expect(matchAll("abc", /\d/g)).toEqual([]);
  });

  // Единственная причина, по которой этот модуль не однострочник с `exec`.
  // Регулярки лежат в модульных таблицах и переиспользуются: сохранённый
  // `lastIndex` пережил бы вызов, и следующий разбор той же строки начался бы
  // с середины — то есть вернул бы меньше совпадений, чем есть.
  it("leaves the caller's regex untouched between calls", () => {
    const shared = /\d/g;
    expect(matchAll("1 2 3", shared)).toHaveLength(3);
    expect(shared.lastIndex).toBe(0);
    expect(matchAll("1 2 3", shared)).toHaveLength(3);
  });

  it("scans the whole string even without the global flag", () => {
    expect(matchAll("1 2 3", /\d/)).toHaveLength(3);
  });

  // Без сдвига руками совпадение нулевой длины оставляет `lastIndex` на месте
  // и цикл не кончается никогда. В оригинале защита встроена.
  it("does not hang on a zero-length match", () => {
    expect(matchAll("ab", /x?/g).length).toBeGreaterThan(0);
  });
});
