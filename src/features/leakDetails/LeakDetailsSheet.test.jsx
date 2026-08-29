import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS } from "@/utils/status";

/**
 * Лист подробностей — слой проводки: состояние живёт в `useLeakDetailsSheet`,
 * содержимое вкладок — в `ViewBlock`/`EditBlock`, у каждого свои тесты. Здесь
 * проверяется то, чего не проверяет ни один из них: что во что воткнуто.
 * Поэтому хук подменён целиком, а дети — заглушками, показывающими, что им
 * пришло.
 */
const mocks = vi.hoisted(() => ({ sheet: null, photoSrc: "blob:герой" }));

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});
vi.mock("@/hooks/usePhotoSrc", () => ({
  usePhotoSrc: () => mocks.photoSrc,
}));
vi.mock("@/hooks/useModalDialog", () => ({ useModalDialog: () => null }));
vi.mock("./hooks/useLeakDetailsSheet", async () => {
  const actual = await vi.importActual("./hooks/useLeakDetailsSheet");
  return { ...actual, useLeakDetailsSheet: () => mocks.sheet };
});

vi.mock("./components/PhotoBlock", () => ({
  default: ({ identityNum, onView, onStatusChange, src }) => (
    <div>
      <span>{identityNum}</span>
      <span data-testid="hero">{src ?? "без фото"}</span>
      <button onClick={onStatusChange}>сменить-статус</button>
      {onView && <button onClick={onView}>открыть-фото</button>}
    </div>
  ),
}));
vi.mock("./components/ViewBlock", () => ({
  default: ({ activeTab, data }) => (
    <div data-testid="view-block" data-tab={activeTab}>
      {data.object}
    </div>
  ),
}));
vi.mock("./components/EditBlock", () => ({
  default: ({ activeTab, onEditBefore, showAfter, showRepair }) => (
    <div
      data-testid="edit-block"
      data-tab={activeTab}
      data-after={String(showAfter)}
      data-repair={String(showRepair)}
    >
      <button onClick={onEditBefore}>править-фото-до</button>
    </div>
  ),
}));
vi.mock("@/features/photos/PhotoViewer/PhotoViewer", () => ({
  default: ({ src }) => <div data-testid="viewer">{src}</div>,
}));
vi.mock("@/features/resolve/ResolveModal/ResolveModal", () => ({
  default: ({ mode }) => <div data-testid="resolve">{mode ?? "resolve"}</div>,
}));
vi.mock("@/features/status/ReopenLeakModal/ReopenLeakModal", () => ({
  default: () => <div data-testid="reopen" />,
}));
vi.mock("@/features/status/StatusPickerModal/StatusPickerModal", () => ({
  default: () => <div data-testid="status-picker" />,
}));
vi.mock("@/components/ui/Notification/Notification", () => ({
  default: ({ notification }) =>
    notification ? <div role="alert">{notification.message}</div> : null,
}));
vi.mock("@/components/ui/ConfirmSheet/ConfirmSheet", () => ({
  default: ({ open, onConfirm }) =>
    open ? <button onClick={onConfirm}>подтвердить-закрытие</button> : null,
}));

const LeakDetailsSheet = (await import("./LeakDetailsSheet")).default;
const { MODE } = await import("./hooks/useLeakDetailsSheet");

const leak = { id: "l1", leak_id: "TAG-7", object: "дренажная линия" };

function sheetState(overrides = {}) {
  const noop = vi.fn();
  return {
    mode: MODE.VIEW,
    activeTab: "main",
    setActiveTab: vi.fn(),
    localEdit: {},
    setLocalEdit: noop,
    localCalcParams: {},
    setLocalCalcParams: noop,
    saving: false,
    notification: null,
    setNotification: noop,
    viewerOpen: false,
    setViewerOpen: vi.fn(),
    closeConfirmOpen: false,
    deleteArmed: false,
    resolveOpen: false,
    setResolveOpen: noop,
    repairOpen: false,
    setRepairOpen: noop,
    reopenOpen: false,
    setReopenOpen: noop,
    statusPickerOpen: false,
    setStatusPickerOpen: noop,
    fileInputRef: { current: null },
    fileInputAfterRef: { current: null },
    fileInputRepairRef: { current: null },
    src: null,
    srcAfter: null,
    srcRepair: null,
    isNative: false,
    projectConfig: { steps: { steps: [] } },
    vars: {},
    status: STATUS.OPEN,
    ago: "5 минут назад",
    TABS: [
      { id: "main", label: "Основное" },
      { id: "history", label: "История" },
    ],
    STATUS,
    handleSave: vi.fn(),
    handleClose: vi.fn(),
    confirmClose: vi.fn(),
    cancelClose: vi.fn(),
    handleStatusChange: vi.fn(),
    handleStatusSelect: vi.fn(),
    handleResolveConfirm: vi.fn(),
    handleRepairConfirm: vi.fn(),
    handleReopenConfirm: vi.fn(),
    handleEdit: vi.fn(),
    handleCancel: vi.fn(),
    armDelete: vi.fn(),
    confirmDelete: vi.fn(),
    changePhoto: vi.fn(),
    choosePhoto: vi.fn(),
    changePhotoAfter: vi.fn(),
    choosePhotoAfter: vi.fn(),
    changePhotoRepair: vi.fn(),
    choosePhotoRepair: vi.fn(),
    ...overrides,
  };
}

function renderSheet(state = {}, props = {}) {
  mocks.sheet = sheetState(state);
  const { unmount } = render(
    <LeakDetailsSheet
      leak={leak}
      allLeaks={[leak]}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      userProfile={{ name: "Инспектор" }}
      {...props}
    />,
  );
  return { state: mocks.sheet, unmount };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.photoSrc = "blob:герой";
  // Активная вкладка подтягивается в видимую часть ленты; в jsdom этого метода
  // нет вовсе, как и прокрутки.
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("LeakDetailsSheet в режиме просмотра", () => {
  it("показывает номер записи и содержимое активной вкладки", () => {
    renderSheet();

    expect(screen.getByText("№ TAG-7")).toBeInTheDocument();
    expect(screen.getByTestId("view-block")).toHaveAttribute(
      "data-tab",
      "main",
    );
    expect(screen.getByText("дренажная линия")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-block")).not.toBeInTheDocument();
  });

  it("переключает вкладку по нажатию", () => {
    const { state } = renderSheet();

    fireEvent.click(screen.getByText("История"));

    expect(state.setActiveTab).toHaveBeenCalledWith("history");
  });

  it("удаление требует второго нажатия", () => {
    // Кнопка сначала взводится и только потом удаляет: на телефоне корзина
    // оказывается под большим пальцем, а отменить удаление нечем.
    const first = renderSheet();
    fireEvent.click(screen.getByTitle("Delete leak"));
    expect(first.state.armDelete).toHaveBeenCalledOnce();
    expect(first.state.confirmDelete).not.toHaveBeenCalled();
    first.unmount();

    const armed = renderSheet({ deleteArmed: true });
    fireEvent.click(screen.getByText("Delete?"));
    expect(armed.state.confirmDelete).toHaveBeenCalledOnce();
  });

  it("без обработчика удаления кнопки нет вовсе", () => {
    renderSheet({}, { onDelete: undefined });

    expect(screen.queryByTitle("Delete leak")).not.toBeInTheDocument();
  });

  it("снимок открывается на весь экран только когда он есть", () => {
    const withPhoto = renderSheet();
    fireEvent.click(screen.getByText("открыть-фото"));
    expect(withPhoto.state.setViewerOpen).toHaveBeenCalledWith(true);
    withPhoto.unmount();

    mocks.photoSrc = null;
    renderSheet();
    expect(screen.queryByText("открыть-фото")).not.toBeInTheDocument();
  });
});

describe("LeakDetailsSheet в режиме правки", () => {
  it("прячет снимок из шапки: он редактируется внутри", () => {
    renderSheet({ mode: MODE.EDIT });

    expect(screen.getByTestId("hero")).toHaveTextContent("без фото");
    expect(screen.getByTestId("edit-block")).toBeInTheDocument();
  });

  it("на устранённой записи открывает снимок «после», на ремонтируемой — «в ремонте»", () => {
    const resolved = renderSheet({ mode: MODE.EDIT, status: STATUS.RESOLVED });
    expect(screen.getByTestId("edit-block")).toHaveAttribute(
      "data-after",
      "true",
    );
    resolved.unmount();

    renderSheet({ mode: MODE.EDIT, status: STATUS.IN_PROGRESS });
    expect(screen.getByTestId("edit-block")).toHaveAttribute(
      "data-repair",
      "true",
    );
  });

  it("в браузере правка снимка открывает выбор файла, а не камеру", () => {
    // Ссылку подменить нельзя: лист сам рисует скрытое поле файла и кладёт в
    // неё свой узел. Наблюдаем за настоящим щелчком по нему.
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    const { state } = renderSheet({ mode: MODE.EDIT, isNative: false });

    fireEvent.click(screen.getByText("править-фото-до"));

    expect(click).toHaveBeenCalledOnce();
    expect(state.changePhoto).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("на телефоне правка снимка идёт в камеру", () => {
    const { state } = renderSheet({ mode: MODE.EDIT, isNative: true });

    fireEvent.click(screen.getByText("править-фото-до"));

    expect(state.changePhoto).toHaveBeenCalledOnce();
  });

  it("во время сохранения кнопка занята", () => {
    renderSheet({ mode: MODE.EDIT, saving: true });

    expect(screen.getByText("Saving...")).toBeDisabled();
  });
});

describe("LeakDetailsSheet поднимает окна поверх себя", () => {
  it("подтверждение закрытия без сохранения", () => {
    const { state } = renderSheet({ mode: MODE.EDIT, closeConfirmOpen: true });

    fireEvent.click(screen.getByText("подтвердить-закрытие"));

    expect(state.confirmClose).toHaveBeenCalledOnce();
  });

  it("просмотр снимка, выбор статуса, устранение, ремонт и переоткрытие", () => {
    for (const [flag, testId, text] of [
      ["viewerOpen", "viewer", "blob:герой"],
      ["statusPickerOpen", "status-picker", null],
      ["resolveOpen", "resolve", "resolve"],
      ["repairOpen", "resolve", "repair"],
      ["reopenOpen", "reopen", null],
    ]) {
      const { unmount } = renderSheet({ [flag]: true });
      const node = screen.getByTestId(testId);
      if (text) expect(node).toHaveTextContent(text);
      else expect(node).toBeInTheDocument();
      unmount();
    }
  });

  it("уведомление показывается поверх всего", () => {
    renderSheet({ notification: { type: "error", message: "не сохранилось" } });

    expect(screen.getByRole("alert")).toHaveTextContent("не сохранилось");
  });
});
