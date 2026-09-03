import { beforeEach, describe, expect, it } from "vitest";
import {
  completeMonitoringRound,
  getRestoredMonitoringRound,
  inferMonitoringRound,
  readMonitoringRound,
  saveMonitoringRound,
} from "./monitoringRound";

describe("monitoring round persistence", () => {
  beforeEach(() => localStorage.clear());

  it("stores a round under the target project id", () => {
    const round = {
      id: "round-7",
      number: 7,
      startedAt: "2026-07-14T05:00:00.000Z",
    };

    saveMonitoringRound("project-1", round);

    expect(readMonitoringRound("project-1")).toEqual(round);
  });

  it("persists completion time without losing round metadata", () => {
    const completed = completeMonitoringRound(
      {
        id: "round-8",
        number: 8,
        startedAt: "2026-07-14T05:00:00.000Z",
      },
      "2026-07-14T08:00:00.000Z",
    );

    saveMonitoringRound("project-1", completed);

    expect(readMonitoringRound("project-1")).toEqual({
      id: "round-8",
      number: 8,
      startedAt: "2026-07-14T05:00:00.000Z",
      completedAt: "2026-07-14T08:00:00.000Z",
    });
  });

  it("migrates monitoring rounds created by legacy seed scripts", () => {
    const round = {
      id: "seed-round-4",
      number: 4,
      startedAt: "2026-07-14T05:00:00.000Z",
    };
    localStorage.setItem(
      "app:project-1:monitoring_round_v1",
      JSON.stringify(round),
    );

    expect(readMonitoringRound("project-1")).toEqual(round);
    expect(
      JSON.parse(localStorage.getItem("app:project-1:monitoring_round_v2")),
    ).toEqual(round);
    expect(
      localStorage.getItem("app:project-1:monitoring_round_v1"),
    ).toBeNull();
  });

  it("infers the latest round for backups created before round metadata", () => {
    const restored = getRestoredMonitoringRound(null, [
      {
        monitoringRecords: [
          {
            roundId: "round-1",
            roundNumber: 1,
            date: "2026-07-12T10:00:00.000Z",
          },
          {
            roundId: "round-2",
            roundNumber: 2,
            date: "2026-07-14T06:00:00.000Z",
          },
        ],
      },
      {
        monitoringRecords: [
          {
            roundId: "round-2",
            roundNumber: 2,
            date: "2026-07-14T05:00:00.000Z",
          },
        ],
      },
    ]);

    expect(restored).toEqual({
      id: "round-2",
      number: 2,
      startedAt: "2026-07-14T05:00:00.000Z",
    });
  });

  it("infers a round when legacy records only contain round numbers", () => {
    const restored = getRestoredMonitoringRound(null, [
      {
        monitoringRecords: [
          {
            roundNumber: 3,
            date: "2026-07-14T07:00:00.000Z",
          },
          {
            roundNumber: 2,
            date: "2026-07-13T07:00:00.000Z",
          },
        ],
      },
    ]);

    expect(restored).toEqual({
      id: "legacy-round-3",
      number: 3,
      startedAt: "2026-07-14T07:00:00.000Z",
    });
  });

  it("выводит обход из ленты событий, а не только из старого списка", () => {
    // Обход пишется теперь только в ленту. Чтение сырого `monitoringRecords`
    // означало бы, что текущий обход выводится из одного наследства, а свежие
    // осмотры не видны вовсе.
    const round = inferMonitoringRound([
      {
        id: "leak-1",
        events: [
          {
            id: "e1",
            type: "inspection",
            date: "2026-08-04T10:00:00.000Z",
            roundId: "round-9",
            roundNumber: 9,
            result: "still_leaking",
          },
        ],
      },
    ]);

    expect(round).toMatchObject({ id: "round-9", number: 9 });
  });
});
