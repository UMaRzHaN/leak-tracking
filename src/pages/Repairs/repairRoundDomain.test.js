import { describe, expect, it } from "vitest";
import {
  REPAIR_ROUND_FILTER as FILTER,
  getRepairRoundItems,
  repairRoundState,
  summarizeRepairRound,
} from "./repairRoundDomain";

const round = { number: 1, startedAt: "2026-10-02T00:00:00.000Z" };
const started = { id: "s", type: "repair_started", date: "2026-10-01T08:00Z" };
const mark = (date) => ({
  id: `m-${date}`,
  type: "repair_stage",
  stage: "in_repair",
  date,
});
const repair = (id, events, extra = {}) => ({
  id,
  leak_id: id,
  status: "in_progress",
  events: [started, ...events],
  ...extra,
});

const due = repair("due", [mark("2026-10-01T09:00Z")]);
// «Ждёт МТР» — открытая утечка, а не отметка.
const waiting = repair("waiting", [mark("2026-10-01T09:00Z")], {
  status: "open",
});
const checked = repair("checked", [mark("2026-10-03T09:00Z")]);
const resolvedInRound = repair(
  "resolved-in",
  [{ id: "d", type: "repair_done", date: "2026-10-03T10:00Z" }],
  { status: "resolved" },
);
const resolvedBefore = repair(
  "resolved-before",
  [{ id: "d", type: "repair_done", date: "2026-09-20T10:00Z" }],
  { status: "resolved" },
);
const all = [resolvedBefore, checked, waiting, resolvedInRound, due];

describe("repair round", () => {
  it("places each repair in the round like monitoring tags", () => {
    expect(repairRoundState(due, round)).toBe("due");
    expect(repairRoundState(checked, round)).toBe("checked");
    expect(repairRoundState(resolvedInRound, round)).toBe("checked");
    expect(repairRoundState(resolvedBefore, round)).toBe("outside");
    // Без обхода проверять предстоит всё, что в работе.
    expect(repairRoundState(checked, null)).toBe("due");
  });

  it("counts the tabs and the header", () => {
    expect(summarizeRepairRound(all, round)).toEqual({
      due: 2,
      checked: 2,
      all: 5,
      resolved: 1,
      inRepair: 2,
      waiting: 1,
    });
  });

  it("filters by tab and orders due work first", () => {
    const ids = (filter, search = "") =>
      getRepairRoundItems(all, { filter, search, round }).map(
        (leak) => leak.id,
      );
    expect(ids(FILTER.DUE)).toEqual(["due", "waiting"]);
    expect(ids(FILTER.CHECKED)).toEqual(["checked", "resolved-in"]);
    expect(ids(FILTER.ALL)).toEqual([
      "due",
      "waiting",
      "checked",
      "resolved-in",
      "resolved-before",
    ]);
    expect(ids(FILTER.ALL, "WAIT")).toEqual(["waiting"]);
  });
});
