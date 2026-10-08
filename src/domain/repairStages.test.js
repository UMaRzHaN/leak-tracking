import { describe, expect, it } from "vitest";
import {
  REPAIR_STAGE,
  countRepairStages,
  getRepairBrigade,
  getRepairLeaks,
  getRepairStage,
  markRepairStage,
  getRepairLog,
} from "./repairStages";

const started = (date) => ({ id: `s-${date}`, type: "repair_started", date });
const done = (date) => ({ id: `d-${date}`, type: "repair_done", date });
const stage = (value, date, extra = {}) => ({
  id: `m-${date}`,
  type: "repair_stage",
  stage: value,
  date,
  ...extra,
});

describe("getRepairStage", () => {
  it("treats a fresh repair as in progress until it is marked", () => {
    expect(
      getRepairStage({
        status: "in_progress",
        events: [started("2026-10-01")],
      }),
    ).toBe(REPAIR_STAGE.IN_REPAIR);
  });

  it("keeps a repair in repair whatever old marks say", () => {
    const leak = {
      status: "in_progress",
      events: [
        started("2026-09-01"),
        stage("ready", "2026-09-02"),
        done("2026-09-03"),
        started("2026-10-01"),
        stage("waiting_mtr", "2026-10-02"),
      ],
    };
    // «Ожидает МТР» — это открытая утечка; отметки прошлых версий
    // («ждём МТР», «готово») стадию идущего ремонта не меняют.
    expect(getRepairStage(leak)).toBe(REPAIR_STAGE.IN_REPAIR);
  });

  it("follows the status: resolved, open waiting for materials", () => {
    expect(
      getRepairStage({
        status: "resolved",
        events: [started("2026-10-01"), done("2026-10-02")],
      }),
    ).toBe(REPAIR_STAGE.RESOLVED);
    // Устранённая и без ремонта — тоже «устранена».
    expect(getRepairStage({ status: "resolved", events: [] })).toBe(
      REPAIR_STAGE.RESOLVED,
    );
    // Открытая утечка — ремонт по ней не начат, она ждёт МТР.
    expect(getRepairStage({ status: "open" })).toBe(REPAIR_STAGE.WAITING_MTR);
  });
});

describe("repair lists", () => {
  const leaks = [
    { id: "a", status: "in_progress", events: [started("2026-10-01")] },
    {
      id: "b",
      status: "in_progress",
      events: [started("2026-10-01"), stage("ready", "2026-10-02")],
    },
    { id: "c", status: "open" },
    {
      id: "d",
      status: "resolved",
      events: [started("2026-10-01"), done("2026-10-03")],
    },
  ];

  it("collects repairs and counts them by stage", () => {
    expect(getRepairLeaks(leaks).map((leak) => leak.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(countRepairStages(leaks)).toMatchObject({
      all: 4,
      in_repair: 2,
      resolved: 1,
      waiting_mtr: 1,
    });
  });
});

describe("markRepairStage", () => {
  const leak = {
    id: "a",
    status: "in_progress",
    events: [started("2026-10-01")],
  };

  it("records the stage with the brigade and moves the leak along", () => {
    const now = Date.parse("2026-10-05T10:20:00Z");
    const marked = markRepairStage(
      leak,
      {
        stage: "in_repair",
        brigade: " Бригада 2 ",
        note: "Прокладка заменена",
      },
      { user: "Иван", now },
    );

    expect(getRepairStage(marked)).toBe(REPAIR_STAGE.IN_REPAIR);
    expect(getRepairBrigade(marked)).toBe("Бригада 2");
    expect(marked.events[marked.events.length - 1]).toMatchObject({
      user: "Иван",
      note: "Прокладка заменена",
    });
    expect(marked.updatedAt).toBe(now);
  });

  it("refuses to mark outside a repair or to accept by a mark", () => {
    expect(() =>
      markRepairStage({ status: "open" }, { stage: "ready" }),
    ).toThrow();
    expect(() => markRepairStage(leak, { stage: "resolved" })).toThrow();
  });
});

describe("getRepairLog", () => {
  it("даёт снимку ремонта пару — последний снимок записи до него", () => {
    const leak = {
      status: "resolved",
      photo: "idb://first",
      events: [
        { ...started("2026-10-01"), photo: "idb://start" },
        { ...done("2026-10-02"), photo: "idb://done" },
      ],
    };
    const [doneRow, startedRow] = getRepairLog(leak);

    expect(doneRow).toMatchObject({
      photo: "idb://done",
      previousPhoto: "idb://start",
    });
    // Перед первым ремонтом — снимок, с которым утечку заводили.
    expect(startedRow).toMatchObject({
      photo: "idb://start",
      previousPhoto: "idb://first",
    });
  });

  it("берёт в «до» и снимок осмотра, и первичный, подменённый им", () => {
    const leak = {
      status: "resolved",
      // Осмотр «утечка есть» подменил первичный снимок своим.
      photo: "idb://round",
      events: [
        {
          id: "i1",
          type: "inspection",
          date: "2026-10-01",
          photo: "idb://round",
          previousPhoto: "idb://first",
        },
        { ...started("2026-09-20"), photo: "idb://early" },
        { ...done("2026-10-05"), photo: "idb://done" },
      ],
    };
    const log = getRepairLog(leak);

    expect(log[0]).toMatchObject({ previousPhoto: "idb://round" });
    expect(log[1]).toMatchObject({ previousPhoto: "idb://first" });
  });

  it("не даёт пары строке без снимка и снимку, что не менялся", () => {
    const leak = {
      status: "in_progress",
      photo: "idb://same",
      events: [
        started("2026-10-01"),
        { ...stage("in_repair", "2026-10-02"), photo: "idb://same" },
      ],
    };
    for (const row of getRepairLog(leak)) {
      expect(row).not.toHaveProperty("previousPhoto");
    }
  });

  it("lists repair events and returns to open, newest first", () => {
    const leak = {
      status: "open",
      events: [
        started("2026-10-01"),
        {
          ...stage("in_repair", "2026-10-02"),
          brigade: "Бригада 2",
          note: "Хомут",
        },
      ],
      history: [
        { action: "created", date: "2026-09-30T00:00:00Z" },
        {
          action: "status_changed",
          to: "in_progress",
          date: "2026-10-01T00:00:00Z",
        },
        {
          action: "status_changed",
          to: "open",
          date: "2026-10-03T00:00:00Z",
          user: "Ким",
        },
      ],
    };
    const log = getRepairLog(leak);
    expect(log.map((item) => item.kind)).toEqual([
      "returned",
      "repair_stage",
      "repair_started",
    ]);
    expect(log[1]).toMatchObject({
      stage: "in_repair",
      brigade: "Бригада 2",
      note: "Хомут",
    });
    expect(log[0].user).toBe("Ким");
  });

  it("не пишет возврат, если ремонт до переоткрытия закрыл осмотр", () => {
    const leak = {
      status: "open",
      events: [started("2026-10-01")],
      history: [
        {
          action: "status_changed",
          to: "in_progress",
          date: "2026-10-01T00:00:00Z",
        },
        { action: "monitoring", to: "resolved", date: "2026-10-02T00:00:00Z" },
        { action: "status_changed", to: "open", date: "2026-10-03T00:00:00Z" },
      ],
    };
    expect(getRepairLog(leak).map((item) => item.kind)).toEqual([
      "repair_started",
    ]);
  });

  it("несёт ответы проверки ремонта про физ. тег и фикцию", () => {
    const log = getRepairLog({
      status: "in_progress",
      events: [
        started("2026-10-01"),
        {
          ...stage("in_repair", "2026-10-02"),
          physicalTag: false,
          fiction: false,
        },
      ],
    });
    expect(log[0]).toMatchObject({ physicalTag: false, fiction: false });
    // Начало ремонта ни о чём не спрашивало — и полей у него нет.
    expect(log[1]).not.toHaveProperty("physicalTag");
  });

  it("does not count reopening a resolved leak as a repair return", () => {
    const log = getRepairLog({
      history: [
        {
          action: "status_changed",
          to: "in_progress",
          date: "2026-10-01T00:00:00Z",
        },
        {
          action: "status_changed",
          to: "resolved",
          date: "2026-10-02T00:00:00Z",
        },
        { action: "status_changed", to: "open", date: "2026-10-03T00:00:00Z" },
      ],
    });
    expect(log).toEqual([]);
  });

  it("shows a return with its waiting mark as one row", () => {
    const log = getRepairLog({
      status: "open",
      events: [
        started("2026-10-01"),
        stage("waiting_mtr", "2026-10-03T00:00:00.001Z"),
      ],
      history: [
        {
          action: "status_changed",
          to: "in_progress",
          date: "2026-10-01T00:00:00Z",
        },
        { action: "status_changed", to: "open", date: "2026-10-03T00:00:00Z" },
      ],
    });
    expect(log.map((item) => item.stage ?? item.kind)).toEqual([
      "waiting_mtr",
      "repair_started",
    ]);
  });
});
