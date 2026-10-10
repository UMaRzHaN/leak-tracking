import { describe, expect, it } from "vitest";
import { groupRecentLeaks } from "./recentGroups";

const now = new Date(2026, 9, 5, 15, 0).getTime();
const at = (id, date) => ({ id, createdAt: date });

describe("groupRecentLeaks", () => {
  it("splits records into today, yesterday and earlier", () => {
    const groups = groupRecentLeaks(
      [
        at("a", new Date(2026, 9, 5, 9, 0).toISOString()),
        at("b", new Date(2026, 9, 4, 23, 59).getTime()),
        at("c", new Date(2026, 9, 4, 0, 0)),
        at("d", new Date(2026, 9, 1).toISOString()),
      ],
      now,
    );

    expect(
      groups.map((group) => [group.key, group.leaks.map((l) => l.id)]),
    ).toEqual([
      ["today", ["a"]],
      ["yesterday", ["b", "c"]],
      ["earlier", ["d"]],
    ]);
  });

  it("drops empty groups and files undated records as earlier", () => {
    const groups = groupRecentLeaks([at("x", null), at("y", "не дата")], now);

    expect(groups).toEqual([
      { key: "earlier", leaks: [at("x", null), at("y", "не дата")] },
    ]);
  });
});
