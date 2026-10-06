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
});
