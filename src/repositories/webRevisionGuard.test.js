import { beforeEach, describe, expect, it } from "vitest";
import {
  assertNotOverwritingNewer,
  forgetRevision,
  lastSeenRevision,
  rememberRevision,
  resetRevisionMemoryForTests,
} from "@/repositories/webRevisionGuard";

const KEY = "project-1";

beforeEach(() => {
  resetRevisionMemoryForTests();
});

describe("память ревизий", () => {
  it("держит самую свежую из виденных", () => {
    rememberRevision(KEY, 5);
    rememberRevision(KEY, 9);
    expect(lastSeenRevision(KEY)).toBe(9);
  });

  // Порядок чтений не гарантирован: зеркало могут прочитать после основной
  // копии, и оно бывает старее. Отступать назад нельзя — иначе своя же
  // следующая запись выглядела бы чужой.
  it("не отступает назад на более старой ревизии", () => {
    rememberRevision(KEY, 9);
    rememberRevision(KEY, 5);
    expect(lastSeenRevision(KEY)).toBe(9);
  });

  it.each([null, undefined, NaN, "не число"])("не запоминает %s", (value) => {
    rememberRevision(KEY, value);
    expect(lastSeenRevision(KEY)).toBeNull();
  });

  it("забывает по требованию", () => {
    rememberRevision(KEY, 5);
    forgetRevision(KEY);
    expect(lastSeenRevision(KEY)).toBeNull();
  });

  it("считает ключи независимо", () => {
    rememberRevision("leaks", 5);
    rememberRevision("components:leaks", 9);
    expect(lastSeenRevision("leaks")).toBe(5);
  });
});

describe("assertNotOverwritingNewer", () => {
  // Ровно тот случай, ради которого всё: вторая вкладка держит набор,
  // прочитанный до правок первой.
  it("отказывает, когда в хранилище ревизия свежее", () => {
    rememberRevision(KEY, 5);
    expect(() => assertNotOverwritingNewer(KEY, [7])).toThrowError(
      expect.objectContaining({ code: "PROJECT_CHANGED_ELSEWHERE" }),
    );
  });

  it("несёт обе ревизии для диагностики", () => {
    rememberRevision(KEY, 5);
    try {
      assertNotOverwritingNewer(KEY, [4, 7, null]);
      throw new Error("должно было отказать");
    } catch (error) {
      expect(error.seenRevision).toBe(5);
      expect(error.storedRevision).toBe(7);
    }
  });

  it("пропускает свою же запись", () => {
    rememberRevision(KEY, 5);
    expect(() => assertNotOverwritingNewer(KEY, [5, 5])).not.toThrow();
  });

  it("пропускает, когда хранилище отстаёт", () => {
    rememberRevision(KEY, 9);
    expect(() => assertNotOverwritingNewer(KEY, [5])).not.toThrow();
  });

  // Ложный отказ хуже исходной ошибки: та теряет данные изредка, этот
  // блокирует сохранение постоянно. Поэтому сомнение — в пользу записи.
  it("пропускает, когда вкладка ничего не видела", () => {
    expect(() => assertNotOverwritingNewer(KEY, [7])).not.toThrow();
  });

  it("пропускает, когда в хранилище нет ревизий", () => {
    rememberRevision(KEY, 5);
    expect(() =>
      assertNotOverwritingNewer(KEY, [null, undefined]),
    ).not.toThrow();
  });

  it("не путает ключи между собой", () => {
    rememberRevision("leaks", 5);
    expect(() =>
      assertNotOverwritingNewer("components:leaks", [7]),
    ).not.toThrow();
  });
});
