import { describe, expect, it } from "vitest";
import {
  applyRecordEdits,
  editableInspections,
  editableRepairs,
  hasRecordEdits,
} from "./recordEdits";

const inspection = (id, date, extra = {}) => ({
  id,
  type: "inspection",
  date: `${date}T10:00:00.000Z`,
  result: "resolved",
  monitoredBy: "Doston",
  ...extra,
});

describe("recordEdits", () => {
  it("правит ответы и текст осмотра и пишет их в лог одной записью", () => {
    const record = inspection("i1", "2026-10-05", { physicalTag: true });
    // Обход лежит и в ленте, и в старом списке — это одна запись.
    const leak = {
      status: "resolved",
      events: [record],
      monitoringRecords: [{ ...record }],
    };

    const { leak: next, changes } = applyRecordEdits(leak, {
      i1: { physicalTag: false, fiction: true, comment: "  бирку сорвали  " },
    });

    expect(next.events[0]).toMatchObject({
      physicalTag: false,
      fiction: true,
      comment: "бирку сорвали",
      monitoredBy: "Doston",
    });
    expect(next.monitoringRecords[0].physicalTag).toBe(false);
    expect(changes.map(({ key, from, to }) => [key, from, to])).toEqual([
      ["physicalTag", true, false],
      ["fiction", undefined, true],
      ["comment", undefined, "бирку сорвали"],
    ]);
    expect(changes[0].record).toEqual({
      kind: "inspection",
      date: "2026-10-05T10:00:00.000Z",
    });
  });

  it("статус идёт за исправленным итогом последнего осмотра", () => {
    const leak = {
      status: "resolved",
      events: [
        inspection("old", "2026-09-01", { result: "still_leaking" }),
        inspection("last", "2026-10-05"),
      ],
    };

    const { leak: next, changes } = applyRecordEdits(leak, {
      last: { result: "still_leaking" },
    });

    expect(next.status).toBe("open");
    expect(changes.at(-1)).toEqual({
      key: "status",
      from: "resolved",
      to: "open",
    });
  });

  it("не ставит снимок осмотра сразу в «до» и «в ремонте»", () => {
    // Осмотр «утечка есть» сделал свой снимок снимком утечки, прежний
    // помнит в previousPhoto. Итог исправили на «повторную проверку».
    const leak = {
      status: "open",
      photo: "idb://round",
      photo_after: "idb://stale-after",
      events: [
        inspection("i1", "2026-10-05", {
          result: "still_leaking",
          photo: "idb://round",
          previousPhoto: "idb://first",
        }),
      ],
    };

    const { leak: next, changes } = applyRecordEdits(leak, {
      i1: { result: "needs_recheck" },
    });

    expect(next.status).toBe("in_progress");
    // «До» — снимок до обхода; снимок осмотра остаётся переходом в ремонт.
    expect(next.photo).toBe("idb://first");
    expect(next.events[0].photo).toBe("idb://round");
    expect(next.photo_after).toBeNull();
    expect(changes.map((change) => change.key)).toEqual([
      "result",
      "status",
      "photo",
    ]);

    // Обратно на «утечка есть» — снимок осмотра снова «до».
    const back = applyRecordEdits(next, { i1: { result: "still_leaking" } });
    expect(back.leak.status).toBe("open");
    expect(back.leak.photo).toBe("idb://round");
  });

  it("старый осмотр статус не трогает", () => {
    const leak = {
      status: "resolved",
      events: [
        inspection("old", "2026-09-01", { result: "still_leaking" }),
        inspection("last", "2026-10-05"),
      ],
    };
    const { leak: next } = applyRecordEdits(leak, {
      old: { result: "resolved" },
    });
    expect(next.status).toBe("resolved");
  });

  it("после ремонта статус решал уже ремонт", () => {
    const leak = {
      status: "in_progress",
      events: [
        inspection("last", "2026-10-01", { result: "still_leaking" }),
        { id: "r1", type: "repair_started", date: "2026-10-02T10:00:00Z" },
      ],
    };
    const { leak: next } = applyRecordEdits(leak, {
      last: { result: "resolved" },
    });
    expect(next.status).toBe("in_progress");
    expect(next.events[0].result).toBe("resolved");
  });

  it("правит бригаду, МТР и физ. тег у проверки ремонта", () => {
    const leak = {
      events: [
        {
          id: "s1",
          type: "repair_stage",
          stage: "in_repair",
          date: "2026-10-02T10:00:00Z",
          brigade: "Бригада 1",
        },
      ],
    };
    expect(editableRepairs(leak)).toHaveLength(1);
    const { leak: next, changes } = applyRecordEdits(leak, {
      s1: {
        brigade: "Бригада 2",
        physicalTag: false,
        materials_equipment: "Хомут",
      },
    });
    expect(next.events[0]).toMatchObject({
      brigade: "Бригада 2",
      physicalTag: false,
      materials_equipment: "Хомут",
      materialsChanged: true,
    });
    expect(changes.every((change) => change.record.kind === "repair")).toBe(
      true,
    );
  });

  it("правка, вернувшая прежние значения, правкой не считается", () => {
    const leak = { events: [inspection("i1", "2026-10-05", { comment: "x" })] };
    const edits = { i1: { result: "resolved", comment: "x " } };
    expect(hasRecordEdits(leak, edits)).toBe(false);
    expect(applyRecordEdits(leak, edits)).toEqual({ leak, changes: [] });
    expect(editableInspections(leak)).toHaveLength(1);
  });
});
