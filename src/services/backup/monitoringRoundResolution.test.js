import { describe, expect, it } from "vitest";
import { resolveMonitoringRound } from "./projectMeta";

/**
 * Какой обход становится текущим после обмена архивами.
 *
 * Проверяется симметрия: решение принимают оба телефона, каждый со своей
 * стороны, и оно обязано сойтись. То же требование, что у параметров расчёта —
 * и нарушалось оно здесь той же формой, строгим «свежее».
 */
const started = (number, id, at) => ({ id, number, startedAt: at });
const completed = (number, id, at, done) => ({
  id,
  number,
  startedAt: at,
  completedAt: done,
});

/** Что выберет каждая из сторон при обмене. */
function bothSides(onA, onB) {
  return [
    resolveMonitoringRound(onA, onB)?.id,
    resolveMonitoringRound(onB, onA)?.id,
  ];
}

const MORNING = "2026-03-10T10:00:00.000Z";
const NOON = "2026-03-10T11:00:00.000Z";

describe("текущий обход при синхронизации", () => {
  it("начатый третий не уступает завершённому второму", () => {
    // Обходчик начал третий обход в десять; напарник в одиннадцать закрыл
    // второй. По времени второй свежее — и телефон откатывался на него: точки,
    // пройденные в третьем обходе, снова показывались непройденными.
    expect(
      bothSides(
        started(3, "r3", MORNING),
        completed(2, "r2", "2026-03-09T09:00:00.000Z", NOON),
      ),
    ).toEqual(["r3", "r3"]);
  });

  it("новый обход приезжает на телефон, который о нём не знал", () => {
    expect(
      bothSides(
        completed(2, "r2", "2026-03-09T09:00:00.000Z", NOON),
        started(3, "r3", MORNING),
      ),
    ).toEqual(["r3", "r3"]);
  });

  it("в пределах одного обхода побеждает тот, кто знает больше", () => {
    // Один и тот же обход: у напарника он уже закрыт, у нас ещё нет.
    expect(
      bothSides(started(3, "r3", MORNING), completed(3, "r3", MORNING, NOON)),
    ).toEqual(["r3", "r3"]);
    expect(
      resolveMonitoringRound(
        started(3, "r3", MORNING),
        completed(3, "r3", MORNING, NOON),
      ).completedAt,
    ).toBe(NOON);
  });

  it("при полном равенстве стороны сходятся на одном обходе", () => {
    // Иначе два телефона так и живут с разными текущими обходами, и на каждом
    // свой список того, что осталось пройти.
    const [onA, onB] = bothSides(
      started(3, "первый", MORNING),
      started(3, "второй", MORNING),
    );

    expect(onA).toBe(onB);
  });

  it("порядок сторон на итог не влияет", () => {
    const a = completed(4, "r4", MORNING, NOON);
    const b = started(4, "r4-другой", MORNING);

    expect(resolveMonitoringRound(a, b)).toEqual(resolveMonitoringRound(b, a));
  });

  it("отсутствие обхода не спорит с обходом", () => {
    const round = started(1, "r1", MORNING);

    expect(resolveMonitoringRound(null, round)).toBe(round);
    expect(resolveMonitoringRound(round, null)).toBe(round);
    expect(resolveMonitoringRound(null, null)).toBeNull();
  });

  it("обход без номера не вытесняет пронумерованный", () => {
    // Номер выводят и из старых записей, где его могло не остаться вовсе.
    expect(
      bothSides(
        { id: "безномера", startedAt: NOON },
        started(2, "r2", MORNING),
      ),
    ).toEqual(["r2", "r2"]);
  });
});
