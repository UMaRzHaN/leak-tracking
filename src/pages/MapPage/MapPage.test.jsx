import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapState = vi.hoisted(() => ({ current: null }));
const leakActions = vi.hoisted(() => ({ setActiveLeak: null }));
vi.mock("@/utils/renderMetrics", () => ({ useRenderMetric: vi.fn() }));
vi.mock("@/pages/Repairs/useCanCheckRepair", () => ({
  useCanCheckRepair: () => () => true,
}));
vi.mock("@/pages/DataBase/hooks/useLeakActions", () => ({
  useLeakActions: () => ({
    activeLeak: null,
    setActiveLeak: leakActions.setActiveLeak,
  }),
}));
vi.mock("@/features/route/RouteBanner", () => ({
  default: ({ onFocus, onEnd }) => (
    <>
      <button onClick={() => onFocus({ id: "next" })}>route-focus</button>
      <button onClick={onEnd}>route-end</button>
    </>
  ),
}));
vi.mock("./components/MapPinCard", () => ({
  default: ({ onOpenLeak, onOpenComponent }) => (
    <>
      <button onClick={() => onOpenLeak({ id: "leak-1" })}>open-leak</button>
      <button onClick={() => onOpenComponent({ id: "c-7" })}>
        open-component
      </button>
    </>
  ),
}));
vi.mock("./components/MapComponentDetails", () => ({
  default: ({ componentId, onClose }) => (
    <button onClick={onClose}>component:{componentId}</button>
  ),
}));
vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ deletePhoto: vi.fn() }),
}));
vi.mock("./hooks/useMapPage", () => ({
  MAP_BASE: { LEAKS: "leaks", COMPONENTS: "components" },
  useMapPage: () => mapState.current,
}));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ onClose }) => <button onClick={onClose}>notification</button>,
}));
vi.mock("./components/MapControls", () => ({
  default: (props) => (
    <div>
      {props.topContent}
      <button onClick={props.onLocate}>locate</button>
      <button onClick={props.onOpenSheet}>open-sheet</button>
      <button onClick={props.onDownload}>download</button>
      <button onClick={props.onCancelDownload}>cancel-download</button>
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
// The sheet no longer toggles locations — that moved to the header's folder
// browser — so it only closes and picks a leak.
vi.mock("@/components/ui/MobileSheet/MobileSheet", () => ({
  default: ({ onClose, onSelect, leaks }) => (
    <div>
      <button onClick={onClose}>close-sheet</button>
      <button onClick={() => onSelect(leaks[0])}>pick-leak</button>
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
    exportCount: 1,
    searchedLeaks: [{ id: "leak-1" }],
    tagQuery: "",
    setTagQuery: vi.fn(),
    pickTag: vi.fn(),
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
    base: "leaks",
    setBase: vi.fn(),
    componentsAvailable: true,
    showsComponents: false,
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
    cancelDownload: vi.fn(),
    handleExportKML: vi.fn(),
    focusLeak: vi.fn(),
    locateMe: vi.fn(),
    selectedLeak: null,
    selectLeak: vi.fn(),
  };
}

describe("MapPage", () => {
  beforeEach(() => {
    mapState.current = createState();
    leakActions.setActiveLeak = vi.fn();
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
      "cancel-download",
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
      20,
    );
    expect(mapState.current.pickTag).toHaveBeenCalledWith({ id: "leak-1" });
  });

  // Переключатель базы — единственная кнопка, у которой обе стороны тернарника
  // ведут в разные слои карты, поэтому проверяем оба направления.
  it("hides the KML export when there is nothing to export", () => {
    mapState.current.exportCount = 0;
    render(<MapPage leaks={[]} coords={null} />);

    expect(screen.queryByText(/KML/)).toBeNull();
  });

  it("hides the KML export when no project is open", () => {
    mapState.current.activeProject = null;
    render(<MapPage leaks={[]} coords={null} />);

    expect(screen.queryByText(/KML/)).toBeNull();
  });

  it("встаёт на точку, когда карточка просит «Показать на карте»", async () => {
    const { requestMapFocus } = await import("@/app/mapFocus");
    render(<MapPage leaks={[]} coords={null} />);

    act(() => requestMapFocus({ lat: 41, lng: 69 }));

    expect(leakActions.setActiveLeak).toHaveBeenCalledWith(null);
    expect(mapState.current.selectLeak).toHaveBeenCalledWith(null);
    expect(mapState.current.focusLeak).toHaveBeenCalledWith(
      { lat: 41, lng: 69 },
      20,
    );
  });

  it("ведёт по маршруту обхода и завершает его", () => {
    const onRouteEnd = vi.fn();
    render(
      <MapPage
        leaks={[]}
        coords={null}
        routeProgress={{ done: 0 }}
        onRouteEnd={onRouteEnd}
      />,
    );

    fireEvent.click(screen.getByText("route-focus"));
    expect(mapState.current.focusLeak).toHaveBeenCalledWith({ id: "next" }, 17);
    expect(mapState.current.selectLeak).toHaveBeenCalledWith({ id: "next" });

    fireEvent.click(screen.getByText("route-end"));
    expect(onRouteEnd).toHaveBeenCalled();
  });

  it("на карте инвентаризации плашку маршрута не показывает", () => {
    mapState.current.showsComponents = true;
    render(<MapPage leaks={[]} coords={null} routeProgress={{ done: 0 }} />);

    expect(screen.queryByText("route-focus")).toBeNull();
  });

  it("из карточки булавки открывает запись и компонент", async () => {
    mapState.current.selectedLeak = { id: "leak-1" };
    render(<MapPage leaks={[]} coords={null} />);

    fireEvent.click(screen.getByText("open-leak"));
    expect(mapState.current.selectLeak).toHaveBeenCalledWith(null);
    expect(leakActions.setActiveLeak).toHaveBeenCalledWith({ id: "leak-1" });

    fireEvent.click(screen.getByText("open-component"));
    const details = await screen.findByText("component:c-7");
    fireEvent.click(details);
    expect(screen.queryByText("component:c-7")).toBeNull();
  });

  it("прячет карточку булавки, пока открыт список", () => {
    mapState.current.selectedLeak = { id: "leak-1" };
    mapState.current.open = true;
    render(<MapPage leaks={[]} coords={null} />);

    expect(screen.queryByText("open-leak")).toBeNull();
  });
});
