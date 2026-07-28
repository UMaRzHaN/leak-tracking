import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapState = vi.hoisted(() => ({ current: null }));
vi.mock("@/utils/renderMetrics", () => ({ useRenderMetric: vi.fn() }));
vi.mock("./hooks/useMapPage", () => ({ useMapPage: () => mapState.current }));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ onClose }) => <button onClick={onClose}>notification</button>,
}));
vi.mock("./components/MapControls", () => ({
  default: (props) => (
    <div>
      <button onClick={props.onLocate}>locate</button>
      <button onClick={props.onOpenSheet}>open-sheet</button>
      <button onClick={props.onDownload}>download</button>
      <button onClick={props.onToggleHeatmap}>heatmap</button>
      <button onClick={() => props.onToggleNearby(true)}>nearby</button>
      <button onClick={() => props.onRadiusChange(500)}>radius</button>
      <button onClick={() => props.onPriorityToggle("high")}>priority</button>
      <button onClick={props.onPriorityClear}>priority-clear</button>
      <button onClick={() => props.onStatusToggle("open")}>status</button>
      <button onClick={props.onStatusClear}>status-clear</button>
      <button onClick={() => props.onMonitoringChange("round")}>round</button>
    </div>
  ),
}));
vi.mock("./components/TileProgress", () => ({
  default: () => <div>progress</div>,
}));
vi.mock("@/components/ui/MobileSheet/MobileSheet", () => ({
  default: ({
    onClose,
    onSelect,
    leaks,
    onToggleMainLocation,
    onToggleLocation,
  }) => (
    <div>
      <button onClick={onClose}>close-sheet</button>
      <button onClick={() => onSelect(leaks[0])}>pick-leak</button>
      <button onClick={() => onToggleMainLocation("field")}>
        main-location
      </button>
      <button onClick={() => onToggleLocation("station")}>location</button>
    </div>
  ),
}));

import MapPage from "./MapPage";

function createState() {
  return {
    containerRef: { current: null },
    open: false,
    setOpen: vi.fn(),
    notification: { message: "ready" },
    setNotification: vi.fn(),
    tileProgress: { total: 1 },
    downloading: false,
    visibleLeaks: [{ id: "leak-1" }],
    monitoringFilter: "all",
    hasMonitoringRound: true,
    mainLocations: ["field"],
    mainLocationLabel: "MGPA",
    enabledMainLocations: { field: true },
    locations: ["station"],
    locationLabel: "Station",
    enabledLocations: ["station"],
    activeProject: { id: "project-1" },
    heatmapEnabled: false,
    nearbyOnly: false,
    nearbyRadius: 100,
    nearbyRadiusOptions: [100, 500],
    priorityFilters: [],
    statusFilters: [],
    hasGps: true,
    setHeatmapEnabled: vi.fn((update) => update(false)),
    setMonitoringFilter: vi.fn(),
    setNearbyOnly: vi.fn((update) =>
      typeof update === "function" ? update(false) : update,
    ),
    setNearbyRadius: vi.fn(),
    togglePriorityFilter: vi.fn(),
    clearPriorityFilters: vi.fn(),
    toggleStatusFilter: vi.fn(),
    clearStatusFilters: vi.fn(),
    toggleMainLocation: vi.fn(),
    toggleLocation: vi.fn(),
    handleDownloadArea: vi.fn(),
    handleExportKML: vi.fn(),
    focusLeak: vi.fn(),
    locateMe: vi.fn(),
  };
}

describe("MapPage", () => {
  beforeEach(() => {
    mapState.current = createState();
  });

  it("connects map controls, export, filters, and sheet selection", () => {
    render(
      <MapPage
        leaks={mapState.current.visibleLeaks}
        coords={{ lat: 1, lng: 2 }}
      />,
    );

    for (const label of [
      "notification",
      "locate",
      "open-sheet",
      "download",
      "heatmap",
      "nearby",
      "radius",
      "priority",
      "priority-clear",
      "status",
      "status-clear",
      "round",
      "KML",
      "close-sheet",
      "pick-leak",
      "main-location",
      "location",
    ])
      fireEvent.click(screen.getByText(label === "KML" ? /KML/ : label));

    expect(mapState.current.setNotification).toHaveBeenCalledWith(null);
    expect(mapState.current.setOpen).toHaveBeenCalledWith(true);
    expect(mapState.current.setOpen).toHaveBeenCalledWith(false);
    expect(mapState.current.setNearbyRadius).toHaveBeenCalledWith(500);
    expect(mapState.current.setNearbyOnly).toHaveBeenCalled();
    expect(mapState.current.handleExportKML).toHaveBeenCalled();
    expect(mapState.current.focusLeak).toHaveBeenCalledWith(
      { id: "leak-1" },
      17,
    );
  });
});
