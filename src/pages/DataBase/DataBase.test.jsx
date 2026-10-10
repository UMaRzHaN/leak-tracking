import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ current: null }));

vi.mock("@/utils/renderMetrics", () => ({ useRenderMetric: vi.fn() }));
vi.mock("@/pages/Repairs/useCanCheckRepair", () => ({
  useCanCheckRepair: () => () => true,
}));
// Resolves against the real English locale, so these assertions fail if the
// screen loses a translation rather than quietly falling back to the key.
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({
    system: { location: { secondary: "station", label: "Station" } },
  }),
}));
vi.mock("./hooks/useDataBaseController", () => ({
  useDataBaseController: () => controller.current,
}));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ onClose }) => <button onClick={onClose}>notification</button>,
}));
vi.mock("./components/FilterBar", () => ({
  default: ({ setSearch, setFilter }) => (
    <div>
      <button onClick={() => setSearch("needle")}>search</button>
      <button onClick={() => setFilter("open")}>filter</button>
    </div>
  ),
}));
vi.mock("./components/ResultsBar", () => ({
  default: ({ onSortToggle, onMonitorSelected, onEditBulkCalculation }) => (
    <div>
      <button onClick={onSortToggle}>sort</button>
      <button onClick={onMonitorSelected}>monitor-selected</button>
      <button onClick={onEditBulkCalculation}>bulk-calculation</button>
    </div>
  ),
}));
vi.mock("./components/LeakList", () => ({
  default: ({ items, onOpenDetails, onMonitor, onToggleSelect }) => (
    <div>
      <span>items:{items.length}</span>
      <button onClick={() => onOpenDetails(items[0])}>details</button>
      <button onClick={() => onMonitor(items[0])}>monitor</button>
      <button onClick={() => onToggleSelect(items[0].id)}>select</button>
    </div>
  ),
}));
vi.mock("./components/LeakModals", () => ({
  default: ({ onCloseDetails, onDelete }) => (
    <div>
      <button onClick={onCloseDetails}>close-details</button>
      <button onClick={() => onDelete("leak-1")}>delete</button>
    </div>
  ),
}));
vi.mock("@/features/settings/SettingsModal/SettingsModal", () => ({
  default: ({ open, onClose, onSave }) =>
    open ? (
      <div>
        <button onClick={onSave}>save-bulk</button>
        <button onClick={onClose}>close-bulk</button>
      </div>
    ) : null,
}));

import DataBase from "./DataBase";

function createController() {
  const leak = { id: "leak-1" };
  return {
    notification: { type: "info", message: "ready" },
    clearNotification: vi.fn(),
    filters: {
      search: "",
      setSearch: vi.fn(),
      statusFilter: "all",
      setFilter: vi.fn(),
      priorityFilter: [],
      setPriorityFilter: vi.fn(),
      locationFilter: [],
      setLocationFilter: vi.fn(),
      locationKey: "station",
      locationOptions: [],
      nearbyFilter: false,
      setNearbyFilter: vi.fn(),
      nearbyRadius: 100,
      setNearbyRadius: vi.fn(),
      nearbyRadiusOptions: [100],
      counts: {},
      hasGps: true,
      displayed: [leak],
      sortAsc: true,
      toggleSort: vi.fn(),
    },
    actions: {
      activeLeak: leak,
      setActiveLeak: vi.fn(),
      handleSave: vi.fn(),
      handleDelete: vi.fn((id, options) => options.onDeleted(id)),
      vars: {},
    },
    bulk: {
      selectedCount: 1,
      allDisplayedSelected: false,
      hiddenSelectedCount: 1,
      selectedIds: new Set(["leak-1", "hidden-by-filter"]),
      actionableSelected: [leak],
      clearActionable: vi.fn(),
      clearSelection: vi.fn(),
      selectDisplayed: vi.fn(),
      toggleSelected: vi.fn(),
      deselectId: vi.fn(),
      bulkCalculationVars: {},
      handleBulkCalculationSave: vi.fn(),
    },
  };
}

describe("DataBase", () => {
  beforeEach(() => {
    controller.current = createController();
  });

  it("wires filters, list actions, selection monitoring and bulk calculation", () => {
    const onMonitorLeak = vi.fn();
    const onMonitorLeaks = vi.fn();
    render(
      <DataBase
        data={[{ id: "leak-1" }]}
        setData={vi.fn()}
        coords={{ lat: 1, lng: 2 }}
        onMonitorLeak={onMonitorLeak}
        onMonitorLeaks={onMonitorLeaks}
      />,
    );

    fireEvent.click(screen.getByText("notification"));
    fireEvent.click(screen.getByText("search"));
    fireEvent.click(screen.getByText("filter"));
    fireEvent.click(screen.getByText("sort"));
    fireEvent.click(screen.getByText("details"));
    fireEvent.click(screen.getByText("monitor"));
    fireEvent.click(screen.getByText("select"));
    fireEvent.click(screen.getByText("monitor-selected"));
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByText("close-details"));
    fireEvent.click(screen.getByText("bulk-calculation"));
    fireEvent.click(screen.getByText("save-bulk"));
    fireEvent.click(screen.getByText("close-bulk"));

    expect(controller.current.filters.setSearch).toHaveBeenCalledWith("needle");
    expect(controller.current.filters.setFilter).toHaveBeenCalledWith("open");
    expect(onMonitorLeak).toHaveBeenCalled();
    expect(onMonitorLeaks).toHaveBeenCalledWith([{ id: "leak-1" }]);
    // «Проверить» — выбранные среди видимых; выбор, скрытый фильтром, не
    // сбрасывается.
    expect(controller.current.bulk.clearActionable).toHaveBeenCalled();
    expect(controller.current.bulk.clearSelection).not.toHaveBeenCalled();
    expect(controller.current.bulk.deselectId).toHaveBeenCalledWith("leak-1");
  });
});
