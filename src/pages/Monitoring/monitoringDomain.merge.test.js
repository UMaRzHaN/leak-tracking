import { describe, expect, it } from "vitest";
import { mergeRoundIntoPrevious } from "./monitoringDomain";
import { isMonitoringDue } from "@/utils/monitoring";

const inspection = (id, date, roundId, roundNumber) => ({
  id,
  type: "inspection",
  date,
  roundId,
  roundNumber,
  result: "still_leaking",
});

describe("mergeRoundIntoPrevious", () => {
  it("moves the mistaken round's inspections into the previous one", () => {
    const data = [
      {
        id: "a",
        events: [inspection("e1", "2026-09-01T10:00:00.000Z", "r2", 2)],
      },
      {
        id: "b",
        events: [inspection("e2", "2026-09-05T10:00:00.000Z", "r3", 3)],
      },
      { id: "c", events: [] },
    ];
    const round = {
      id: "r3",
      number: 3,
      startedAt: "2026-09-05T09:00:00.000Z",
    };

    const result = mergeRoundIntoPrevious(data, round);

    expect(result.round).toEqual({
      id: "r2",
      number: 2,
      startedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(result.moved).toBe(1);
    expect(result.data[1].events[0]).toMatchObject({
      roundId: "r2",
      roundNumber: 2,
    });
    // Не тронутая запись остаётся тем же объектом.
    expect(result.data[0]).toBe(data[0]);
    // В слитом обходе проверены обе, третья — к проверке.
    const due = result.data.map((leak) =>
      isMonitoringDue(leak, result.round.id, result.round.number),
    );
    expect(due).toEqual([false, false, true]);
  });

  it("has nothing to merge the first round into", () => {
    expect(
      mergeRoundIntoPrevious([], {
        id: "r1",
        number: 1,
        startedAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
