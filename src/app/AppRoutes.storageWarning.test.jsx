import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppRoutes from "./AppRoutes";

vi.mock("./hooks/useLanguage", () => ({
  useLanguage: () => ({ lang: "ru" }),
}));

vi.mock("@/hooks/useModalDialog", () => ({
  useModalDialog: () => null,
}));

vi.mock("@/pages/MainPage/MainPage", () => ({
  default: () => <div>main-page-ready</div>,
}));
vi.mock("@/pages/Settings/Settings", () => ({ default: () => null }));
vi.mock("@/pages/AddLeak/AddLeak", () => ({ default: () => null }));
vi.mock("@/pages/DataBase/DataBase", () => ({ default: () => null }));
vi.mock("@/pages/MapPage/MapPage", () => ({ default: () => null }));
vi.mock("@/pages/Monitoring/Monitoring", () => ({ default: () => null }));

const baseProps = {
  activeProject: { id: "project-1", name: "Project 1" },
  clear: vi.fn(),
  coords: null,
  data: [],
  dataLoaded: true,
  goBack: vi.fn(),
  gpsEnabled: false,
  handleCreateExcelCopy: vi.fn(),
  handleImportIntoExisting: vi.fn(),
  handleImportZip: vi.fn(),
  importingDataLabel: null,
  isImportingProject: false,
  lang: "ru",
  loadError: null,
  loadWarning: null,
  page: "",
  prevPage: "",
  requestMonitoring: vi.fn(),
  requestMonitoringQueue: vi.fn(),
  requestedMonitoringLeakId: null,
  requestedMonitoringLeakIds: [],
  retryLoad: vi.fn(),
  save: vi.fn(),
  setPage: vi.fn(),
  setRequestedMonitoringLeakId: vi.fn(),
  setRequestedMonitoringLeakIds: vi.fn(),
  sharedFilters: {},
  userProfile: null,
};

describe("AppRoutes project data storage states", () => {
  it("shows a non-blocking mirror warning together with the active page", async () => {
    render(
      <AppRoutes
        {...baseProps}
        loadWarning={{
          code: "PROJECT_DATA_DEGRADED",
          source: "mirror",
          blocksWrites: false,
        }}
      />,
    );

    expect(
      await screen.findByText("Резервное хранилище браузера недоступно"),
    ).toBeInTheDocument();
    expect(await screen.findByText("main-page-ready")).toBeInTheDocument();
  });

  it("keeps a blocking IndexedDB failure on the recovery screen", async () => {
    render(
      <AppRoutes
        {...baseProps}
        loadError={{
          code: "PROJECT_DATA_DEGRADED",
          source: "indexeddb",
          blocksWrites: true,
        }}
      />,
    );

    expect(
      await screen.findByText("Не удалось прочитать данные"),
    ).toBeInTheDocument();
    expect(screen.queryByText("main-page-ready")).not.toBeInTheDocument();
  });
});
