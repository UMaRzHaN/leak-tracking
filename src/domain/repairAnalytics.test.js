import { describe, expect, it } from "vitest";
import { buildRepairAnalytics } from "@/domain/repairAnalytics";
import { LEAK_EVENT_TYPES } from "@/domain/leakEvents";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 7, 1);

const at = (days) => new Date(START + days * DAY).toISOString();
const started = (id, days) => ({
  id,
  type: LEAK_EVENT_TYPES.REPAIR_STARTED,
  date: at(days),
});
const done = (id, days) => ({
  id,
  type: LEAK_EVENT_TYPES.REPAIR_DONE,
  date: at(days),
});

describe("аналитика ремонтов", () => {
  it("не считает проект, где ещё ничего не чинили", () => {
    const summary = buildRepairAnalytics([{ id: "1", status: "open" }]);

    expect(summary).toMatchObject({
      repairedLeaks: 0,
      completed: 0,
      inProgress: 0,
      returned: 0,
      medianDuration: null,
      longestOpenRepair: null,
    });
  });

  it("считает вернувшуюся утечку одной записью с двумя попытками", () => {
    const leak = {
      id: "leak-1",
      leak_id: "TAG-1",
      events: [started("a", 0), done("b", 1), started("c", 5), done("d", 8)],
    };

    const summary = buildRepairAnalytics([leak], START + 10 * DAY);

    expect(summary.repairedLeaks).toBe(1);
    expect(summary.completed).toBe(2);
    expect(summary.returned).toBe(1);
    expect(summary.returnedLeaks[0]).toMatchObject({ attempts: 2 });
    expect(summary.returnedLeaks[0].leak.leak_id).toBe("TAG-1");
  });

  it("берёт медиану, а не среднее", () => {
    // Один забытый ремонт на сорок дней не должен объявлять нормой полтора
    // месяца: медиана трёх починок — суточная.
    const leaks = [
      { id: "1", events: [started("a", 0), done("b", 1)] },
      { id: "2", events: [started("c", 0), done("d", 1)] },
      { id: "3", events: [started("e", 0), done("f", 40)] },
    ];

    expect(buildRepairAnalytics(leaks).medianDuration).toBe(DAY);
  });

  it("показывает, сколько висит самая старая незакрытая починка", () => {
    const leaks = [
      { id: "1", events: [started("a", 0)] },
      { id: "2", events: [started("b", 6)] },
    ];

    const summary = buildRepairAnalytics(leaks, START + 10 * DAY);

    expect(summary.inProgress).toBe(2);
    expect(summary.completed).toBe(0);
    expect(summary.longestOpenRepair).toBe(10 * DAY);
    expect(summary.medianDuration).toBeNull();
  });

  it("ставит вперёд утечку, которую чинили больше раз", () => {
    const twice = {
      id: "twice",
      events: [started("a", 0), done("b", 1), started("c", 2), done("d", 3)],
    };
    const thrice = {
      id: "thrice",
      events: [
        started("e", 0),
        done("f", 1),
        started("g", 2),
        done("h", 3),
        started("i", 4),
        done("j", 5),
      ],
    };

    const summary = buildRepairAnalytics([twice, thrice]);

    expect(summary.returnedLeaks.map((item) => item.leak.id)).toEqual([
      "thrice",
      "twice",
    ]);
  });

  it("переживает записи, где начало ремонта не сохранилось", () => {
    // Старая запись без `repairAt`: закрытие есть, начала нет.
    const leak = { id: "1", events: [done("a", 3)] };

    const summary = buildRepairAnalytics([leak]);

    expect(summary.completed).toBe(1);
    expect(summary.medianDuration).toBeNull();
    expect(summary.returned).toBe(0);
  });
});
