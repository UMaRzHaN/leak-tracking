import { beforeEach, describe, expect, it } from "vitest";
import {
  formatDistance,
  planRoute,
  readRoute,
  routeCandidates,
  routeProgress,
  saveRoute,
} from "./routePlan";

const at = (id, lat, lng, extra = {}) => ({ id, lat, lng, ...extra });

describe("routeCandidates", () => {
  it("takes every leak still due in the round that can be put on a map", () => {
    const checked = {
      type: "inspection",
      date: "2026-10-01T10:00:00.000Z",
      roundId: "r1",
      roundNumber: 1,
    };
    const leaks = [
      at("a", 46.2, 53.2),
      at("b", 46.3, 53.3, { status: "in_progress" }),
      at("c", "", 53.3),
      at("d", 46.1, 53.1, { status: "resolved" }),
      at("e", 46.1, 53.4, { events: [checked] }),
    ];

    expect(
      routeCandidates(leaks, { id: "r1", number: 1 }).map((l) => l.id),
    ).toEqual(["a", "b", "d"]);
  });
});

describe("planRoute", () => {
  it("walks to the nearest unvisited point each time", () => {
    const points = [
      at("far", 46.0, 53.3),
      at("near", 46.0, 53.01),
      at("mid", 46.0, 53.1),
    ];

    const { stops, totalMeters } = planRoute(points, { lat: 46.0, lng: 53.0 });

    expect(stops.map((stop) => stop.leak.id)).toEqual(["near", "mid", "far"]);
    expect(stops[0].legMeters).toBeGreaterThan(0);
    const legs = stops.reduce((sum, stop) => sum + stop.legMeters, 0);
    // Плечи округлены по отдельности — сумма расходится не больше чем на метр
    // на плечо.
    expect(Math.abs(totalMeters - legs)).toBeLessThanOrEqual(stops.length);
  });

  it("starts from the first point without GPS", () => {
    const { stops } = planRoute([at("x", 46, 53), at("y", 46, 53.5)], null);
    expect(stops[0]).toEqual({ leak: at("x", 46, 53), legMeters: 0 });
  });
});

describe("routeProgress", () => {
  const startedAt = "2026-10-05T08:00:00.000Z";
  const checked = (id, date) =>
    at(id, 46, 53, { monitoringRecords: [{ date, result: "still_leaking" }] });

  it("counts points checked after the start and points at the first one left", () => {
    const progress = routeProgress({ ids: ["a", "b", "c"], startedAt }, [
      checked("a", "2026-10-05T09:00:00.000Z"),
      checked("b", "2026-10-04T09:00:00.000Z"),
      at("c", 46, 53),
    ]);

    expect(progress).toMatchObject({ total: 3, done: 1, left: 2, step: 2 });
    expect(progress.current.id).toBe("b");
    expect(progress.finished).toBe(false);
  });

  it("finishes when nothing is left, deleted points included", () => {
    const progress = routeProgress({ ids: ["a", "gone"], startedAt }, [
      checked("a", "2026-10-05T09:00:00.000Z"),
    ]);
    expect(progress).toMatchObject({ done: 2, left: 0, finished: true });
  });
});

describe("route storage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the route per project", () => {
    saveRoute("p1", { ids: ["a"], startedAt: "2026-10-05T08:00:00.000Z" });
    expect(readRoute("p1")?.ids).toEqual(["a"]);
    expect(readRoute("p2")).toBeNull();
    saveRoute("p1", null);
    expect(readRoute("p1")).toBeNull();
  });
});

describe("formatDistance", () => {
  it("switches to kilometres past a kilometre", () => {
    const units = { m: "м", km: "км" };
    expect(formatDistance(180, "ru", units)).toBe("180 м");
    expect(formatDistance(1640, "ru", units)).toBe("1,6 км");
  });
});
