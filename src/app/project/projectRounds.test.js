import { beforeEach, describe, expect, it } from "vitest";
import {
  applyProjectRounds,
  readProjectRounds,
  restoreProjectRounds,
} from "./projectRounds";

const REPAIRS_KEY = "app:p1:repair_round_v1";
const RECONCILE_KEY = "app:p1:reconcile_round_v1";
const round = (number, extra = {}) => ({
  number,
  startedAt: `2026-10-0${number}T00:00:00.000Z`,
  ...extra,
});
const stored = (key) => JSON.parse(localStorage.getItem(key) ?? "null");

describe("projectRounds", () => {
  beforeEach(() => localStorage.clear());

  it("читает оба вида, у вида без обхода — явный null", () => {
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(round(2)));
    expect(readProjectRounds("p1")).toEqual({
      repairs: round(2),
      reconcile: null,
    });
  });

  it("перезапись берёт обходы архива как есть, null стирает", () => {
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(round(4)));
    localStorage.setItem(RECONCILE_KEY, JSON.stringify(round(1)));

    applyProjectRounds("p1", { repairs: round(2), reconcile: null });

    expect(stored(REPAIRS_KEY)).toEqual(round(2));
    expect(stored(RECONCILE_KEY)).toBeNull();
  });

  it("старый архив без поля или без вида ничего не трогает", () => {
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(round(4)));

    applyProjectRounds("p1", undefined);
    applyProjectRounds("p1", { reconcile: round(1) });

    expect(stored(REPAIRS_KEY)).toEqual(round(4));
    expect(stored(RECONCILE_KEY)).toEqual(round(1));
  });

  it("обмен оставляет обход с большим номером, при равном — завершённый", () => {
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(round(3)));
    localStorage.setItem(RECONCILE_KEY, JSON.stringify(round(2)));

    applyProjectRounds(
      "p1",
      {
        repairs: round(2),
        reconcile: round(2, { completedAt: "2026-10-05T00:00:00.000Z" }),
      },
      { resolve: true },
    );

    expect(stored(REPAIRS_KEY)).toEqual(round(3));
    expect(stored(RECONCILE_KEY)).toMatchObject({
      number: 2,
      completedAt: "2026-10-05T00:00:00.000Z",
    });
  });

  it("обмен с null у другой стороны свой обход не стирает", () => {
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(round(3)));
    applyProjectRounds("p1", { repairs: null }, { resolve: true });
    expect(stored(REPAIRS_KEY)).toEqual(round(3));
  });

  it("откат возвращает ровно то, что было", () => {
    const before = { repairs: round(1), reconcile: null };
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(round(5)));
    localStorage.setItem(RECONCILE_KEY, JSON.stringify(round(5)));

    restoreProjectRounds("p1", before);

    expect(readProjectRounds("p1")).toEqual(before);
  });
});
