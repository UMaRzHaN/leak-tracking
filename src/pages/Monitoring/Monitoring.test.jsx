import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const photoStorage = vi.hoisted(() => ({
  deletePhoto: vi.fn(),
  savePhoto: vi.fn(),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => photoStorage,
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
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ raw: new Blob(["photo"], { type: "image/jpeg" }) })
      }
    >
      Attach monitoring photo
    </button>
  ),
}));
vi.mock("@/features/status/ReopenLeakModal/ReopenLeakModal", () => ({
  default: ({ onConfirm }) => (
    <button type="button" onClick={() => onConfirm({ reason: "reopened" })}>
      Confirm monitoring reopen
    </button>
  ),
}));

import Monitoring from "./Monitoring";
import { getMonitoringHistoryComment } from "@/utils/monitoring";
import {
  MONITORING_FILTER,
  buildMonitoringPatch,
  createMonitoringDraft,
  filterLeaksByMonitoring,
  getMonitoringCounts,
  getMonitoringItems,
  getMonitoringRoundSummary,
  getMonitoringPhotoPathsToKeep,
  getNextMonitoringRoundNumber,
} from "./monitoringDomain";

describe("Monitoring round flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

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

  it("uses the latest still-leaking monitoring photo as the current leak photo", () => {
    const patch = buildMonitoringPatch({
      leak: {
        id: "leak-1",
        status: "open",
        photo: "idb://previous-current",
      },
      draft: { result: "still_leaking", materials_equipment: "" },
      monitoredBy: "Inspector",
      photoPath: "idb://monitoring-latest",
      roundId: "round-2",
      roundNumber: 2,
      now: new Date("2026-07-16T08:30:00.000Z"),
    });

    expect(patch.photo).toBe("idb://monitoring-latest");
    expect(patch.photo_after).toBeNull();
    expect(patch.monitoringRecords.at(-1).photo).toBe(
      "idb://monitoring-latest",
    );
  });

  it("shows a monitoring result once and keeps only the user comment in history", () => {
    const patch = buildMonitoringPatch({
      leak: { id: "leak-1", status: "in_progress" },
      draft: {
        result: "resolved",
        comment: "Seal replaced",
        materials_equipment: "",
      },
      monitoredBy: "Inspector",
      photoPath: "idb://after",
      roundId: "round-1",
      roundNumber: 1,
      now: new Date("2026-07-15T08:30:00.000Z"),
    });

    expect(patch.history.at(-1)).toMatchObject({
      action: "monitoring",
      to: "resolved",
      text: "Seal replaced",
    });
    expect(
      getMonitoringHistoryComment({
        action: "monitoring",
        text: "Утечка устранена Seal replaced",
      }),
    ).toBe("Seal replaced");
    expect(
      getMonitoringHistoryComment({
        action: "monitoring",
        text: "Утечка устранена",
      }),
    ).toBe("");
  });

  it("clears a stale after-photo when a resolved leak needs recheck", () => {
    const patch = buildMonitoringPatch({
      leak: {
        id: "leak-1",
        status: "resolved",
        photo_after: "idb://old-after",
      },
      draft: { result: "needs_recheck", materials_equipment: "" },
      monitoredBy: "Inspector",
      photoPath: "idb://recheck",
      roundId: "round-2",
      roundNumber: 2,
      now: new Date("2026-07-16T08:30:00.000Z"),
    });

    expect(patch.status).toBe("in_progress");
    expect(patch.photo_after).toBeNull();
    expect(patch.photo_repair).toBe("idb://recheck");
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
      filterLeaksByMonitoring(
        [checked, due],
        MONITORING_FILTER.DUE,
        "round-4",
        4,
      ),
    ).toEqual([due]);
    expect(
      filterLeaksByMonitoring(
        [checked, due],
        MONITORING_FILTER.CHECKED,
        "round-4",
        4,
      ),
    ).toEqual([checked]);
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
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("heading", { name: "Check" })).toBeNull();
  });

  it("clears a pending monitoring request when round creation is cancelled", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Start monitoring?")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Check" })).toBeNull();
  });

  it("uses the shared monitoring filter and updates it", () => {
    localStorage.setItem(
      "app:project-1:monitoring_round_v2",
      JSON.stringify({
        id: "round-shared",
        number: 1,
        startedAt: "2026-07-23T08:00:00.000Z",
      }),
    );
    const setMonitoringFilter = vi.fn();

    render(
      <Monitoring
        data={[]}
        setData={vi.fn()}
        coords={null}
        sharedFilters={{
          monitoringFilter: MONITORING_FILTER.CHECKED,
          setMonitoringFilter,
        }}
        userProfile={{ name: "Inspector" }}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Checked 0" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Due 0" }));
    expect(setMonitoringFilter).toHaveBeenCalledWith(MONITORING_FILTER.DUE);
  });

  it("saves a monitoring result without a photo when the setting is disabled", async () => {
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const setData = vi.fn().mockResolvedValue(undefined);
    const leak = { id: "leak-1", leak_id: "1001", status: "open" };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All tags 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setData).toHaveBeenCalledOnce());
    expect(photoStorage.savePhoto).not.toHaveBeenCalled();
    expect(setData.mock.calls[0][0][0].monitoringRecords[0].photo).toBeNull();
  });

  it("asks before monitoring a tag twice in the same round", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "All tags 1" }));
    await user.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    expect(screen.getByText("Tag already checked in this round")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Check" })).toBeTruthy();
      expect(screen.getByText("№ 1001")).toBeTruthy();
    });
  });

  it("starts a new round from the already-checked prompt", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "All tags 1" }));
    await user.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    await user.click(screen.getByRole("button", { name: "Start a new round" }));

    await waitFor(() => {
      expect(screen.getByText("Start a new round?")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Start round" }));

    await waitFor(() => {
      const storedRound = JSON.parse(
        localStorage.getItem("app:project-1:monitoring_round_v2"),
      );
      expect(storedRound.number).toBe(3);
      expect(storedRound.id).not.toBe(round.id);
      expect(screen.getByRole("heading", { name: "Check" })).toBeTruthy();
    });
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

  it("processes a requested queue in order within one monitoring round", async () => {
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const setData = vi.fn().mockResolvedValue(undefined);
    const onRequestedLeaksConsumed = vi.fn();
    const leaks = [
      { id: "leak-1", leak_id: "1001", status: "open" },
      { id: "leak-2", leak_id: "1002", status: "open" },
    ];

    render(
      <Monitoring
        data={leaks}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        requestedLeakIds={["missing", "leak-1", "leak-2"]}
        onRequestedLeaksConsumed={onRequestedLeaksConsumed}
        userProfile={{ name: "Inspector" }}
      />,
    );

    expect(onRequestedLeaksConsumed).toHaveBeenCalledOnce();
    expect(screen.getByText("Start monitoring?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));

    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText(/1001/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.getByText(/1002/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("heading", { name: "Check" })).toBeNull();
  });

  it("requires a monitoring photo before writing project data", () => {
    const setData = vi.fn();
    const leak = { id: "leak-1", leak_id: "1001", status: "open" };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All tags 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Add a monitoring photo")).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
  });

  it("requires an inspector name before saving", () => {
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const setData = vi.fn();
    const leak = { id: "leak-1", leak_id: "1001", status: "open" };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "   " }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All tags 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Fill in the user name in profile")).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
  });

  it("reports persistence failures and leaves the monitoring sheet open", async () => {
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const setData = vi.fn().mockRejectedValue(new Error("database locked"));
    photoStorage.savePhoto.mockResolvedValue("idb://monitoring-new");
    photoStorage.deletePhoto.mockResolvedValue(undefined);
    const leak = { id: "leak-1", leak_id: "1001", status: "open" };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All tags 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Swipe monitoring" }));
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Attach monitoring photo" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.getByText("Failed to save monitoring result: database locked"),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("heading", { name: "Check" })).toBeTruthy();
    expect(photoStorage.deletePhoto).toHaveBeenCalledWith(
      "idb://monitoring-new",
    );
  });

  it("uses a new monitoring photo when reopening a resolved leak", async () => {
    const round = {
      id: "round-5-photo",
      number: 5,
      startedAt: "2026-07-15T05:00:00.000Z",
    };
    localStorage.setItem(
      "app:project-1:monitoring_round_v2",
      JSON.stringify(round),
    );
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    photoStorage.savePhoto.mockResolvedValue("idb://monitoring-new");
    photoStorage.deletePhoto.mockResolvedValue(undefined);
    const setData = vi.fn().mockResolvedValue(undefined);
    const leak = {
      id: "leak-1",
      leak_id: "1001",
      status: "resolved",
      photo: "idb://original",
      photo_after: "idb://resolved",
      monitoringRecords: [
        {
          id: "resolved-record",
          date: "2026-07-14T06:00:00.000Z",
          result: "resolved",
          photo: "idb://resolved",
        },
      ],
    };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        requestedLeakId="leak-1"
        onRequestedLeakConsumed={vi.fn()}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Is there a leak?"), {
      target: { value: "still_leaking" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Attach monitoring photo" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm monitoring reopen" }),
    );

    await waitFor(() => expect(setData).toHaveBeenCalledOnce());
    const savedLeak = setData.mock.calls[0][0][0];
    expect(savedLeak.photo).toBe("idb://monitoring-new");
    expect(savedLeak.photo_after).toBeNull();
    expect(savedLeak.monitoringRecords.at(-1).photo).toBe(
      "idb://monitoring-new",
    );
    await waitFor(() =>
      expect(photoStorage.deletePhoto).toHaveBeenCalledWith("idb://original"),
    );
    expect(photoStorage.deletePhoto).not.toHaveBeenCalledWith("idb://resolved");
  });

  it("deletes the orphaned original photo after monitoring reopens a resolved leak", async () => {
    const round = {
      id: "round-5",
      number: 5,
      startedAt: "2026-07-15T05:00:00.000Z",
    };
    localStorage.setItem(
      "app:project-1:monitoring_round_v2",
      JSON.stringify(round),
    );
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const setData = vi.fn().mockResolvedValue(undefined);
    const leak = {
      id: "leak-1",
      leak_id: "1001",
      status: "resolved",
      photo: "idb://original",
      photo_after: "idb://resolved",
    };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        requestedLeakId="leak-1"
        onRequestedLeakConsumed={vi.fn()}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Is there a leak?"), {
      target: { value: "still_leaking" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm monitoring reopen" }),
    );

    await waitFor(() => expect(setData).toHaveBeenCalledOnce());
    expect(setData.mock.calls[0][1]).toEqual({ optimistic: false });
    await waitFor(() =>
      expect(photoStorage.deletePhoto).toHaveBeenCalledWith("idb://original"),
    );
  });

  it("keeps a resolved leak and its original photo when monitoring reopen fails", async () => {
    const round = {
      id: "round-6",
      number: 6,
      startedAt: "2026-07-15T05:00:00.000Z",
    };
    localStorage.setItem(
      "app:project-1:monitoring_round_v2",
      JSON.stringify(round),
    );
    localStorage.setItem(
      "app:project-1:monitoring_settings_v1",
      JSON.stringify({ photoRequired: false }),
    );
    const setData = vi.fn().mockRejectedValue(new Error("database locked"));
    const leak = {
      id: "leak-1",
      leak_id: "1001",
      status: "resolved",
      photo: "idb://original",
      photo_after: "idb://resolved",
    };
    render(
      <Monitoring
        data={[leak]}
        setData={setData}
        coords={null}
        sharedFilters={{}}
        requestedLeakId="leak-1"
        onRequestedLeakConsumed={vi.fn()}
        userProfile={{ name: "Inspector" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Is there a leak?"), {
      target: { value: "still_leaking" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm monitoring reopen" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Failed to save monitoring result: database locked"),
      ).toBeTruthy(),
    );
    expect(setData).toHaveBeenCalledWith(expect.any(Array), {
      optimistic: false,
    });
    expect(photoStorage.deletePhoto).not.toHaveBeenCalledWith("idb://original");
    expect(screen.getByRole("heading", { name: "Check" })).toBeTruthy();
  });
});
