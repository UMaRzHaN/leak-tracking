import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionsState = vi.hoisted(() => ({ current: null }));
vi.mock("./hooks/useMainPageActions", () => ({
  useMainPageActions: () => actionsState.current,
}));
vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    t: (key, options) =>
      `${key}${options?.count == null ? "" : `:${options.count}`}`,
  }),
}));
vi.mock("./components/StatCard", () => ({
  default: ({ label, onClick }) => <button onClick={onClick}>{label}</button>,
}));
vi.mock("./components/EmptyState", () => ({
  default: ({ setPage, hasFilter }) => (
    <button onClick={() => setPage("add")}>empty:{String(hasFilter)}</button>
  ),
}));
vi.mock("@/features/leakList/LeakCardCompact/LeakCardCompact", () => ({
  default: ({ leak, onOpenDetails, onPickStatus, onMonitor }) => (
    <div>
      <span>{leak.id}</span>
      <button onClick={() => onOpenDetails(leak)}>open-leak</button>
      <button onClick={() => onPickStatus(leak)}>pick-status</button>
      <button onClick={() => onMonitor(leak)}>monitor-leak</button>
    </div>
  ),
}));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ onClose }) => <button onClick={onClose}>notification</button>,
}));
vi.mock("@/features/leakDetails/LeakDetailsSheet", () => ({
  default: ({ onClose, onSave, onDelete }) => (
    <div>
      <button onClick={onClose}>close-details</button>
      <button onClick={onSave}>save-details</button>
      <button onClick={onDelete}>delete-details</button>
    </div>
  ),
}));
vi.mock("@/features/status/StatusPickerModal/StatusPickerModal", () => ({
  default: ({ onSelect, onClose }) => (
    <div>
      <button onClick={() => onSelect("resolved")}>select-status</button>
      <button onClick={onClose}>close-status</button>
    </div>
  ),
}));
vi.mock("@/features/resolve/ResolveModal/ResolveModal", () => ({
  default: ({ mode, onConfirm, onClose }) => (
    <div>
      <button onClick={onConfirm}>confirm-{mode ?? "resolve"}</button>
      <button onClick={onClose}>close-{mode ?? "resolve"}</button>
    </div>
  ),
}));
vi.mock("@/features/status/ReopenLeakModal/ReopenLeakModal", () => ({
  default: ({ onConfirm, onClose }) => (
    <div>
      <button onClick={onConfirm}>confirm-reopen</button>
      <button onClick={onClose}>close-reopen</button>
    </div>
  ),
}));

import MainPage from "./MainPage";

function createActions(overrides = {}) {
  const leak = { id: "leak-1", status: "open" };
  return {
    activeLeak: leak,
    setActiveLeak: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    pickerLeak: leak,
    setPickerLeak: vi.fn(),
    resolveLeak: leak,
    setResolveLeak: vi.fn(),
    repairLeak: leak,
    setRepairLeak: vi.fn(),
    reopenLeak: leak,
    setReopenLeak: vi.fn(),
    vars: {},
    notification: { message: "ready" },
    setNotification: vi.fn(),
    stats: { total: 6, open: 2, inProgress: 2, resolved: 2 },
    recent: [leak],
    RECENT_COUNT: 5,
    ALL: "all",
    toggleFilter: vi.fn(),
    handlePickStatus: vi.fn(),
    handleStatusSelect: vi.fn(),
    handleResolveConfirm: vi.fn(),
    handleRepairConfirm: vi.fn(),
    handleReopenConfirm: vi.fn(),
    handleSaveLeak: vi.fn(),
    handleDeleteLeak: vi.fn(),
    ...overrides,
  };
}

describe("MainPage", () => {
  beforeEach(() => {
    actionsState.current = createActions();
  });

  it("wires statistics, recent leaks, navigation, and lifecycle modals", async () => {
    const setPage = vi.fn();
    const onMonitorLeak = vi.fn();
    render(
      <MainPage
        setPage={setPage}
        data={Array.from({ length: 6 }, (_, id) => ({ id }))}
        setData={vi.fn()}
        onMonitorLeak={onMonitorLeak}
      />,
    );

    for (const label of [
      "mainPage.total",
      "mainPage.open",
      "mainPage.inProgress",
      "mainPage.resolved",
      "mainPage.showAll:6",
      "notification",
      "open-leak",
      "pick-status",
      "monitor-leak",
      "close-details",
      "save-details",
      "delete-details",
      "select-status",
      "close-status",
      "confirm-resolve",
      "close-resolve",
      "confirm-repair",
      "close-repair",
      "confirm-reopen",
      "close-reopen",
    ])
      fireEvent.click(await screen.findByText(label));

    expect(setPage).toHaveBeenCalledWith("db");
    expect(onMonitorLeak).toHaveBeenCalledWith({
      id: "leak-1",
      status: "open",
    });
    expect(actionsState.current.handleResolveConfirm).toHaveBeenCalled();
    expect(actionsState.current.handleRepairConfirm).toHaveBeenCalled();
    expect(actionsState.current.handleReopenConfirm).toHaveBeenCalled();
  });

  it("renders filtered empty state and clears the active filter", () => {
    actionsState.current = createActions({
      statusFilter: "resolved",
      recent: [],
      activeLeak: null,
      pickerLeak: null,
      resolveLeak: null,
      repairLeak: null,
      reopenLeak: null,
    });
    const setPage = vi.fn();
    render(<MainPage setPage={setPage} data={[]} setData={vi.fn()} />);

    fireEvent.click(screen.getByText("✕"));
    fireEvent.click(screen.getByText("empty:true"));
    expect(actionsState.current.setStatusFilter).toHaveBeenCalledWith("all");
    expect(setPage).toHaveBeenCalledWith("add");
  });
});
