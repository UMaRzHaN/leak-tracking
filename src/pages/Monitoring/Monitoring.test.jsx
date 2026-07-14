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

import Monitoring, { getMonitoringPhotoPathsToKeep } from "./Monitoring";

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
});
