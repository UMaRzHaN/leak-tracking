import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const LocalSyncSection = (await import("./LocalSyncSection")).default;

const session = {
  host: "192.168.43.1",
  port: 49152,
  code: "123456",
  fingerprint: "A".repeat(64),
  sessionId: "11111111-1111-4111-8111-111111111111",
  remainingSeconds: 125,
  transferCount: 2,
  qrSvg: "<svg />",
};

function makeSync(overrides = {}) {
  return {
    available: true,
    state: { status: "idle", session: null },
    approvalRequest: null,
    allowMultipleImports: false,
    setAllowMultipleImports: vi.fn(),
    startHost: vi.fn(),
    stopHost: vi.fn(),
    scanAndConnect: vi.fn(),
    cancelScan: vi.fn(),
    joinHost: vi.fn(),
    approvePeer: vi.fn(),
    rejectPeer: vi.fn(),
    ...overrides,
  };
}

function renderSection(overrides = {}) {
  const sync = makeSync(overrides);
  const result = render(<LocalSyncSection sync={sync} />);
  return { ...result, sync };
}

/** Заполняет ручное подключение значениями нужной длины. */
function fillManualForm() {
  fireEvent.change(screen.getByLabelText("IP"), {
    target: { value: "192.168.43.1" },
  });
  fireEvent.change(screen.getByLabelText("Port"), {
    target: { value: "49152" },
  });
  fireEvent.change(screen.getByLabelText("Code"), {
    target: { value: "123456" },
  });
  fireEvent.change(screen.getByLabelText("Security key"), {
    target: { value: "a".repeat(64) },
  });
  fireEvent.change(screen.getByLabelText("Session ID"), {
    target: { value: session.sessionId },
  });
}

describe("LocalSyncSection", () => {
  it("не занимает место на платформе, где синхронизации нет", () => {
    const { container } = renderSection({ available: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("показывает состояние сеанса словами", () => {
    renderSection({ state: { status: "merging", session: null } });

    expect(screen.getByText("Merging data")).toBeInTheDocument();
  });

  it("незнакомое состояние не выпускает на экран сырой ключ", () => {
    // Названия состояний приходят от нативного плагина и могут опережать
    // локаль: показать «localSync.status.foo» человеку нельзя.
    renderSection({ state: { status: "какое-то-новое", session: null } });

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText(/localSync\./)).not.toBeInTheDocument();
  });

  describe("раздача с этого телефона", () => {
    it("запускает сеанс и не даёт нажать дважды, пока архив готовится", () => {
      const { sync, unmount } = renderSection();
      fireEvent.click(screen.getByText("Show QR"));
      expect(sync.startHost).toHaveBeenCalledOnce();
      unmount();

      renderSection({ state: { status: "preparing", session: null } });
      expect(screen.getByText("Preparing archive...")).toBeDisabled();
    });

    it("в открытом сеансе показывает всё, что нужно набрать руками на втором телефоне", () => {
      renderSection({ state: { status: "hosting", session } });

      expect(screen.getByText("192.168.43.1:49152")).toBeInTheDocument();
      expect(screen.getByText("123456")).toBeInTheDocument();
      expect(screen.getByText(session.fingerprint)).toBeInTheDocument();
      expect(screen.getByText(session.sessionId)).toBeInTheDocument();
      expect(screen.getByRole("img")).toBeInTheDocument();
    });

    it("остаток времени показывает минутами и секундами", () => {
      renderSection({ state: { status: "hosting", session } });

      expect(screen.getByText("02:05")).toBeInTheDocument();
    });

    it("сеанс можно остановить", () => {
      const { sync } = renderSection({
        state: { status: "hosting", session },
      });

      fireEvent.click(screen.getByText("Stop session"));

      expect(sync.stopHost).toHaveBeenCalledOnce();
    });

    it("раздачу на несколько устройств включают заранее", () => {
      const { sync } = renderSection();

      fireEvent.click(screen.getByRole("checkbox"));

      expect(sync.setAllowMultipleImports).toHaveBeenCalledWith(true);
    });
  });

  describe("подключение со второго телефона", () => {
    it("сканирование запускается и перекрывает экран рамкой с отменой", () => {
      const { sync, unmount } = renderSection();
      fireEvent.click(screen.getByText("Scan QR"));
      expect(sync.scanAndConnect).toHaveBeenCalledOnce();
      unmount();

      const scanning = renderSection({
        state: { status: "scanning", session: null },
      });
      expect(
        screen.getByLabelText("Point the camera at the QR code"),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByText("Cancel"));
      expect(scanning.sync.cancelScan).toHaveBeenCalledOnce();
    });

    it("пока сеанс раздаётся, подключаться к чужому нельзя", () => {
      renderSection({ state: { status: "hosting", session } });

      expect(screen.getByText("Scan QR")).toBeDisabled();
    });
  });

  describe("ручное подключение", () => {
    it("не пускает, пока не набраны все пять значений целиком", () => {
      renderSection();
      const connect = screen.getByText("Connect and synchronize");
      expect(connect).toBeDisabled();

      // Неполный код — всё ещё нельзя: шесть цифр не набраны.
      fireEvent.change(screen.getByLabelText("Code"), {
        target: { value: "12345" },
      });
      expect(connect).toBeDisabled();
    });

    it("подключается набранными значениями", () => {
      const { sync } = renderSection();

      fillManualForm();
      fireEvent.click(screen.getByText("Connect and synchronize"));

      expect(sync.joinHost).toHaveBeenCalledWith({
        host: "192.168.43.1",
        port: "49152",
        code: "123456",
        // Ключ приводится к верхнему регистру: на экране раздающего он
        // показан именно так, и сверять глазами придётся посимвольно.
        fingerprint: "A".repeat(64),
        sessionId: session.sessionId,
      });
    });

    it("поля отсеивают то, что в них попасть не может", () => {
      renderSection();

      fireEvent.change(screen.getByLabelText("Port"), {
        target: { value: "49a152x" },
      });
      fireEvent.change(screen.getByLabelText("Code"), {
        target: { value: "12ab3456789" },
      });
      fireEvent.change(screen.getByLabelText("Security key"), {
        target: { value: "zz" + "f".repeat(70) },
      });

      expect(screen.getByLabelText("Port")).toHaveValue("49152");
      // Код — ровно шесть цифр, лишнее отрезается.
      expect(screen.getByLabelText("Code")).toHaveValue("123456");
      expect(screen.getByLabelText("Security key")).toHaveValue("F".repeat(64));
    });
  });

  describe("подтверждение передачи", () => {
    it("спрашивает разрешение и называет, кто просит", () => {
      const { sync } = renderSection({
        approvalRequest: { mode: "sync", peerAddress: "192.168.43.7" },
      });

      expect(screen.getByText("192.168.43.7", { exact: false })).toBeVisible();
      expect(
        screen.getByText("The second device requests two-way synchronization."),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByText("Allow"));
      expect(sync.approvePeer).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByText("Reject"));
      expect(sync.rejectPeer).toHaveBeenCalledOnce();
    });

    it("копию базы отличает от двусторонней синхронизации", () => {
      renderSection({
        approvalRequest: { mode: "import", peerAddress: "" },
      });

      expect(
        screen.getByText("The second device requests a copy of the database."),
      ).toBeInTheDocument();
      // Адреса нет — на его месте прочерк, а не пустота.
      expect(screen.getByText("Device: —")).toBeInTheDocument();
    });
  });
});
