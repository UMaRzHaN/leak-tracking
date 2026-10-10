import { describe, expect, it } from "vitest";
import { getLeakHeroPhotoPaths } from "./heroPhotoPaths";

describe("getLeakHeroPhotoPaths", () => {
  it("ставит снимок обхода первым и убирает повторы", () => {
    const leak = {
      photo: "idb://before",
      events: [
        {
          type: "inspection",
          date: "2026-09-01T10:00:00.000Z",
          photo: "idb://round",
        },
      ],
    };

    expect(getLeakHeroPhotoPaths(leak)).toEqual([
      "idb://round",
      "idb://before",
    ]);
    expect(getLeakHeroPhotoPaths({ photo: "idb://before" })).toEqual([
      "idb://before",
    ]);
    expect(getLeakHeroPhotoPaths({})).toEqual([]);
  });

  it("возвращает в ленту снимок, который осмотр подменил", () => {
    const leak = {
      photo: "idb://round",
      events: [
        {
          type: "inspection",
          date: "2026-09-01T10:00:00.000Z",
          photo: "idb://round",
          previousPhoto: "idb://before",
        },
      ],
    };

    expect(getLeakHeroPhotoPaths(leak)).toEqual([
      "idb://round",
      "idb://before",
    ]);
  });

  it("ставит первым снимок проверки ремонта, сделанный после осмотра", () => {
    const leak = {
      status: "in_progress",
      photo: "idb://before",
      events: [
        {
          id: "i",
          type: "inspection",
          date: "2026-10-01T10:00:00Z",
          result: "still_leaking",
          photo: "idb://round",
        },
        { id: "s", type: "repair_started", date: "2026-10-02T10:00:00Z" },
        {
          id: "m",
          type: "repair_stage",
          stage: "in_repair",
          date: "2026-10-03T10:00:00Z",
          photo: "idb://repair-check",
        },
      ],
    };

    expect(getLeakHeroPhotoPaths(leak)).toEqual([
      "idb://repair-check",
      "idb://round",
      "idb://before",
    ]);
  });
});
