import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key, options) => options?.defaultValue ?? key,
  }),
}));
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "project-1" } }),
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {} }),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ deletePhoto: vi.fn(), savePhoto: vi.fn() }),
}));
vi.mock("@/pages/DataBase/hooks/useDataBaseFilters", () => ({
  useDataBaseFilters: ({ data }) => ({
    displayed: data,
    search: "",
    setSearch: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    filter: "all",
    setFilter: vi.fn(),
    priorityFilter: "all",
    setPriorityFilter: vi.fn(),
    nearbyFilter: false,
    setNearbyFilter: vi.fn(),
    nearbyRadius: 100,
    setNearbyRadius: vi.fn(),
    nearbyRadiusOptions: [100],
    counts: {},
    hasGps: false,
  }),
}));
vi.mock("@/pages/DataBase/components/FilterBar", () => ({
  default: () => null,
}));
vi.mock("@/features/leakList/LeakCardCompact/LeakCardCompact", () => ({
  default: ({ leak, onMonitor }) => (
    <button type="button" onClick={() => onMonitor(leak)}>
      Swipe monitoring
    </button>
  ),
}));
vi.mock("@/features/leakList/VirtualizedLeakList/VirtualizedLeakList", () => ({
  default: ({ items, renderItem }) =>
    items.map((item, index) => (
      <div key={item.id ?? index}>{renderItem(item)}</div>
    )),
}));
vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: () => null,
}));

import Monitoring from "./Monitoring";
import {
  MONITORING_FILTER,
  buildMonitoringPatch,
  createMonitoringDraft,
  getMonitoringCounts,
  getMonitoringItems,
  getMonitoringRoundSummary,
  getMonitoringPhotoPathsToKeep,
  getNextMonitoringRoundNumber,
} from "./monitoringDomain";

describe("Monitoring round flow", () => {
  beforeEach(() => localStorage.clear());

  it("keeps photos from every previous monitoring record", () => {
    expect(
      getMonitoringPhotoPathsToKeep({
        photo: "idb://before",
        photo_after: "idb://after",
        monitoringRecords: [
          { photo: "idb://round-1" },
          { photo: "idb://round-2" },
          { photo: null },
        ],
      }),
    ).toEqual([
      "idb://before",
      "idb://after",
      "idb://round-1",
      "idb://round-2",
    ]);
  });

  it("stores MTR in a monitoring record only when it changed", () => {
    const now = new Date("2026-07-15T08:30:00.000Z");
    const unchanged = buildMonitoringPatch({
      leak: { id: "leak-1", materials_equipment: "Graphite packing" },
      draft: {
        result: "still_leaking",
        materials_equipment: "Graphite packing",
      },
      monitoredBy: "Inspector",
      lang: "en",
      roundId: "round-1",
      roundNumber: 1,
      now,
    });
    const changed = buildMonitoringPatch({
      leak: { id: "leak-1", materials_equipment: "Graphite packing" },
      draft: {
        result: "still_leaking",
        materials_equipment: "Seal replaced",
      },
      monitoredBy: "Inspector",
      lang: "en",
      roundId: "round-1",
      roundNumber: 1,
      now,
    });

    expect(unchanged.monitoringRecords.at(-1)).not.toHaveProperty(
      "materials_equipment",
    );
    expect(changed.monitoringRecords.at(-1)).toMatchObject({
      id: "leak-1-1784104200000",
      date: "2026-07-15T08:30:00.000Z",
      materials_equipment: "Seal replaced",
      materialsChanged: true,
    });
    expect(changed.history.at(-1).changes).toEqual([
      {
        key: "materials_equipment",
        from: "Graphite packing",
        to: "Seal replaced",
      },
    ]);
  });

  it("builds a consistent round summary, counts and filtered list", () => {
    const due = { id: "due", status: "open", updatedAt: 1 };
    const checked = {
      id: "checked",
      status: "resolved",
      updatedAt: 2,
      monitoringRecords: [
        {
          date: "2026-07-15T08:00:00.000Z",
          roundId: "round-4",
          roundNumber: 4,
        },
      ],
    };
    const leaks = [checked, due];

    expect(getMonitoringRoundSummary(leaks, "round-4", 4)).toEqual({
      total: 2,
      due: 1,
      checked: 1,
      open: 1,
      inProgress: 0,
      resolved: 1,
    });
    expect(getMonitoringCounts(leaks, "round-4", 4)).toEqual({
      due: 1,
      checked: 1,
      all: 2,
    });
    expect(
      getMonitoringItems(leaks, MONITORING_FILTER.DUE, "round-4", 4),
    ).toEqual([due]);
    expect(
      getMonitoringItems(leaks, MONITORING_FILTER.ALL, "round-4", 4).map(
        (leak) => leak.id,
      ),
    ).toEqual(["due", "checked"]);
  });

  it("continues round numbering after the largest stored round", () => {
    expect(
      getNextMonitoringRoundNumber(
        [
          { monitoringRecords: [{ roundNumber: 7 }] },
          { monitoringRecords: [{ roundNumber: "invalid" }] },
        ],
        4,
      ),
    ).toBe(8);
  });

  it("creates a complete draft while preserving entered values", () => {
    expect(
      createMonitoringDraft(
        { status: "resolved", materials_equipment: "Old seal" },
        { comment: "Recheck", photo: { src: "preview" } },
      ),
    ).toEqual({
      result: "resolved",
      comment: "Recheck",
      materials_equipment: "Old seal",
      photo: { src: "preview" },
    });
  });

  it("opens the requested monitoring modal after starting a round", () => {
    const leak = { id: "leak-1", leak_id: "1001", status: "open" };
    render(
      <Monitoring
        data={[leak]}
        setData={vi.fn()}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All tags 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    expect(screen.getByText("Start monitoring?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start round" }));

    expect(screen.getByRole("heading", { name: "Check" })).toBeTruthy();
    expect(screen.getByText("№ 1001")).toBeTruthy();
  });

  it("asks before monitoring a tag twice in the same round", () => {
    const round = {
      id: "round-2",
      number: 2,
      startedAt: "2026-07-14T05:00:00.000Z",
    };
    localStorage.setItem(
      "app:project-1:monitoring_round_v2",
      JSON.stringify(round),
    );
    const leak = {
      id: "leak-1",
      leak_id: "1001",
      status: "open",
      monitoringRecords: [
        {
          id: "record-1",
          roundNumber: round.number,
          date: "2026-07-14T06:00:00.000Z",
          result: "still_leaking",
        },
      ],
    };
    render(
      <Monitoring
        data={[leak]}
        setData={vi.fn()}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All tags 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    expect(screen.getByText("Tag already checked in this round")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(screen.getByRole("heading", { name: "Check" })).toBeTruthy();
    expect(screen.getByText("№ 1001")).toBeTruthy();
  });

  it("completes a fully checked round and requires a new round", () => {
    const round = {
      id: "round-3",
      number: 3,
      startedAt: "2026-07-14T05:00:00.000Z",
    };
    localStorage.setItem(
      "app:project-1:monitoring_round_v2",
      JSON.stringify(round),
    );
    const leak = {
      id: "leak-1",
      leak_id: "1001",
      status: "open",
      monitoringRecords: [
        {
          id: "record-1",
          roundId: round.id,
          roundNumber: round.number,
          date: "2026-07-14T06:00:00.000Z",
          result: "still_leaking",
        },
      ],
    };
    render(
      <Monitoring
        data={[leak]}
        setData={vi.fn()}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "Inspector" }}
      />,
    );

    expect(screen.getByText("All tags checked")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Complete round" })[0],
    );

    expect(screen.getAllByText("Round completed").length).toBeGreaterThan(0);
    expect(
      JSON.parse(localStorage.getItem("app:project-1:monitoring_round_v2"))
        .completedAt,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    expect(screen.getByText("Start a new round?")).toBeTruthy();
  });
});
