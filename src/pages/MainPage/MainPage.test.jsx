import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionsState = vi.hoisted(() => ({ current: null }));
// Правило обхода ремонтов проверяется у себя (repairRoundDomain); здесь —
// что карточка слушается его ответа.
const repairGate = vi.hoisted(() => ({ canCheck: () => true }));
vi.mock("@/pages/Repairs/useCanCheckRepair", () => ({
  useCanCheckRepair: () => (leak) => repairGate.canCheck(leak),
}));
vi.mock("./hooks/useMainPageActions", () => ({
  useMainPageActions: (args) => {
    actionsState.args = args;
    return actionsState.current;
  },
}));
vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    t: (key, options) =>
      `${key}${options?.count == null ? "" : `:${options.count}`}`,
  }),
}));
vi.mock("./components/EmptyState", () => ({
  default: ({ setPage, canAdd }) => (
    <button onClick={() => setPage("add")}>empty:{String(canAdd)}</button>
  ),
}));
vi.mock("@/features/leakList/LeakCardCompact/LeakCardCompact", () => ({
  default: ({ leak, onOpenDetails, onMonitor }) => (
    <div>
      <span>{leak.id}</span>
      <button onClick={() => onOpenDetails(leak)}>open-leak</button>
      {onMonitor && (
        <button onClick={() => onMonitor(leak)}>monitor-leak</button>
      )}
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
import MainPage from "./MainPage";

function createActions(overrides = {}) {
  const leak = { id: "leak-1", status: "open" };
  return {
    activeLeak: leak,
    setActiveLeak: vi.fn(),
    notification: { message: "ready" },
    setNotification: vi.fn(),
    stats: { total: 6, open: 2, inProgress: 2, resolved: 2 },
    recent: [leak],
    RECENT_COUNT: 5,
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    ALL: "all",
    handleSaveLeak: vi.fn(),
    handleDeleteLeak: vi.fn(),
    ...overrides,
  };
}

describe("MainPage", () => {
  beforeEach(() => {
    actionsState.current = createActions();
  });

  it("wires recent leaks, navigation, and the details sheet", async () => {
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
      "mainPage.showAll:6",
      "notification",
      "open-leak",
      "monitor-leak",
      "close-details",
      "save-details",
      "delete-details",
    ])
      fireEvent.click(await screen.findByText(label));

    expect(setPage).toHaveBeenCalledWith("db");
    expect(onMonitorLeak).toHaveBeenCalledWith({
      id: "leak-1",
      status: "open",
    });
    expect(actionsState.current.handleSaveLeak).toHaveBeenCalled();
    expect(actionsState.current.handleDeleteLeak).toHaveBeenCalled();
  });

  it("offers the first leak when the location has no records", () => {
    actionsState.current = createActions({
      recent: [],
      activeLeak: null,
    });
    const setPage = vi.fn();
    render(<MainPage setPage={setPage} data={[]} setData={vi.fn()} />);

    fireEvent.click(screen.getByText("empty:true"));
    expect(setPage).toHaveBeenCalledWith("add");
  });

  it("groups recent records by day under their own headings", () => {
    const now = Date.now();
    actionsState.current = createActions({
      recent: [
        { id: "fresh", createdAt: now },
        { id: "old", createdAt: now - 10 * 24 * 60 * 60 * 1000 },
      ],
      activeLeak: null,
    });
    render(<MainPage setPage={vi.fn()} data={[]} setData={vi.fn()} />);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "mainPage.groups.today",
      "mainPage.groups.earlier",
    ]);
    // «Все →» стоит один раз — у первой группы.
    expect(screen.getAllByText(/mainPage\.showAll/)).toHaveLength(1);
  });

  it("shows coverage with a bar only when the total is known", () => {
    const { rerender } = render(
      <MainPage
        setPage={vi.fn()}
        data={[]}
        setData={vi.fn()}
        coverage={{ surveyed: 3, total: 10, percent: 30 }}
      />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "30",
    );

    rerender(
      <MainPage
        setPage={vi.fn()}
        data={[]}
        setData={vi.fn()}
        coverage={{ surveyed: 3, total: null, percent: null }}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("mainPage.coverage.noRegistry")).toBeTruthy();
  });

  it("counts the selected location on the show-all button, not the project", () => {
    // The button leads to the database, which is scoped, so a project-wide
    // number would promise records that screen will not show.
    actionsState.current = createActions({
      stats: { total: 6, open: 6, inProgress: 0, resolved: 0 },
    });
    render(
      <MainPage
        setPage={vi.fn()}
        data={Array.from({ length: 20 }, (_, id) => ({ id }))}
        scopedData={Array.from({ length: 6 }, (_, id) => ({ id }))}
        setData={vi.fn()}
      />,
    );

    expect(screen.getByText("mainPage.showAll:6")).toBeTruthy();
    expect(screen.queryByText("mainPage.showAll:20")).toBeNull();
  });

  it("hides the show-all button when the location holds no more than the recent list", () => {
    actionsState.current = createActions({
      stats: { total: 3, open: 3, inProgress: 0, resolved: 0 },
    });
    render(
      <MainPage
        setPage={vi.fn()}
        data={Array.from({ length: 20 }, (_, id) => ({ id }))}
        scopedData={Array.from({ length: 3 }, (_, id) => ({ id }))}
        setData={vi.fn()}
      />,
    );

    expect(screen.queryByText(/mainPage\.showAll/)).toBeNull();
  });

  it("filters by status chips in the monitoring module and offers no adding", () => {
    actionsState.current = createActions({
      recent: [],
      activeLeak: null,
    });
    render(
      <MainPage
        setPage={vi.fn()}
        data={[]}
        setData={vi.fn()}
        module="monitoring"
        coverage={{ surveyed: 1, total: 2, percent: 50 }}
      />,
    );

    // Охват — на главной LDAR; в мониторинге на его месте чипы.
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByText("mainPage.chips.open"));
    expect(actionsState.current.setStatusFilter).toHaveBeenCalledWith("open");
    expect(screen.getByText("empty:false")).toBeTruthy();
  });

  it("chips every leak by repair stage in the repairs module", () => {
    const repair = {
      id: "r1",
      status: "in_progress",
      events: [{ id: "s", type: "repair_started", date: "2026-10-01" }],
    };
    actionsState.current = createActions({
      recent: [],
      activeLeak: null,
    });
    render(
      <MainPage
        setPage={vi.fn()}
        data={[repair, { id: "x1", status: "resolved", events: [] }]}
        setData={vi.fn()}
        module="repairs"
      />,
    );

    // Чипы стадий вместо статусов: ожидает МТР, в ремонте, устранена.
    expect(screen.getByText("repairs.stages.in_repair")).toBeTruthy();
    expect(screen.getByText("repairs.stages.resolved")).toBeTruthy();
    expect(screen.queryByText("repairs.stages.ready")).toBeNull();
    expect(
      screen.getByRole("button", { name: /repairs\.all/ }).textContent,
    ).toContain("2");
    expect(screen.getByText("empty:false")).toBeTruthy();
  });

  it("свайп по принятому ремонту тоже ведёт в проверку", () => {
    const resolved = { id: "x1", status: "resolved", events: [] };
    const onMonitorLeak = vi.fn();
    actionsState.current = createActions({
      recent: [resolved],
      activeLeak: null,
    });
    render(
      <MainPage
        setPage={vi.fn()}
        data={[resolved]}
        setData={vi.fn()}
        module="repairs"
        onMonitorLeak={onMonitorLeak}
      />,
    );

    fireEvent.click(screen.getByText("monitor-leak"));
    expect(onMonitorLeak).toHaveBeenCalledWith(resolved);
  });

  it("в идущем обходе не ведёт в проверку ремонт, принятый до него", () => {
    const resolved = { id: "x1", status: "resolved", events: [] };
    repairGate.canCheck = () => false;
    actionsState.current = createActions({
      recent: [resolved],
      activeLeak: null,
    });
    render(
      <MainPage
        setPage={vi.fn()}
        data={[resolved]}
        setData={vi.fn()}
        module="repairs"
        onMonitorLeak={vi.fn()}
      />,
    );

    expect(screen.queryByText("monitor-leak")).toBeNull();
    repairGate.canCheck = () => true;
  });

  it("чип стадии отбирает ремонты этой стадии", () => {
    const inRepair = {
      id: "r1",
      status: "in_progress",
      events: [{ id: "s", type: "repair_started", date: "2026-10-01" }],
    };
    const resolved = { id: "x1", status: "resolved", events: [] };
    actionsState.current = createActions({ recent: [], activeLeak: null });
    render(
      <MainPage
        setPage={vi.fn()}
        data={[inRepair, resolved]}
        setData={vi.fn()}
        module="repairs"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /repairs\.stages\.resolved/ }),
    );

    expect(actionsState.args.scopedData).toEqual([resolved]);
  });

  it("ведёт с карточки покрытия на экран покрытия", () => {
    const setPage = vi.fn();
    render(
      <MainPage
        setPage={setPage}
        data={[]}
        setData={vi.fn()}
        coverage={{ surveyed: 3, total: 10, percent: 30 }}
      />,
    );

    fireEvent.click(screen.getByText(/mainPage\.coverage\.open/));

    expect(setPage).toHaveBeenCalledWith("coverage");
  });
});
