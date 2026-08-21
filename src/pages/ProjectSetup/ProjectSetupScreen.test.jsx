import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSetupScreen from "./ProjectSetupScreen";

const localSync = vi.hoisted(() => ({
  cancelLocalSyncQrScan: vi.fn(),
  fetchLocalSyncArchive: vi.fn(),
  isLocalSyncAvailable: vi.fn(() => true),
  scanLocalSyncQr: vi.fn(),
}));

// Файл принимает одна кнопка, а что это за файл — решает распознавание.
const routing = vi.hoisted(() => ({ detectImportKind: vi.fn() }));
vi.mock("@/services/import/importRouting", () => routing);

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

vi.mock("@/services/sync/localSyncService", () => ({
  fetchLocalSyncArchive: localSync.fetchLocalSyncArchive,
  isLocalSyncAvailable: localSync.isLocalSyncAvailable,
}));
vi.mock("@/services/sync/localSyncQr", () => ({
  cancelLocalSyncQrScan: localSync.cancelLocalSyncQrScan,
  scanLocalSyncQr: localSync.scanLocalSyncQr,
}));

vi.mock("@/services/backup/projectBackupService", () => ({
  peekBackupZip: vi.fn().mockResolvedValue({
    leaks: [],
    meta: { project: { name: "Imported", type: "upstream" } },
    detectedType: "upstream",
  }),
}));

const backupService = await import("@/services/backup/projectBackupService");

describe("ProjectSetupScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localSync.isLocalSyncAvailable.mockReturnValue(true);
    routing.detectImportKind.mockResolvedValue({ kind: "project" });
  });

  /** Единственное файловое поле экрана. */
  const fileInput = (container) =>
    container.querySelector('input[type="file"]');

  it("shows an import progress notice while importing zip into an empty app", async () => {
    const onImportZip = vi.fn(() => new Promise(() => {}));
    const { container } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={onImportZip} />,
    );

    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: {
        files: [new File(["zip"], "backup.zip", { type: "application/zip" })],
      },
    });

    expect((await screen.findByRole("status")).textContent).toContain(
      "ZIP backup import in progress, please wait...",
    );
  });

  it("stops showing progress when an import finishes without opening a project", async () => {
    // Успешный импорт обычно уводит с этого экрана, и раньше на это всё и
    // опиралось. Если проект не открылся, экран оставался с вечным «Импорт…»
    // и без единой кнопки — ровно то, что видно на телефоне.
    routing.detectImportKind.mockResolvedValue({ kind: "inventory" });
    const onImportInventory = vi.fn().mockResolvedValue({ components: 3 });
    const { container } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportInventory={onImportInventory}
      />,
    );

    fireEvent.change(fileInput(container), {
      target: {
        files: [new File(["zip"], "!Inventorization_Бузахур.zip")],
      },
    });

    await waitFor(() => expect(onImportInventory).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("imports an Excel archive into a new project after selecting its type", async () => {
    const onImportExcel = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportExcel={onImportExcel}
      />,
    );

    routing.detectImportKind.mockResolvedValue({ kind: "excel" });
    fireEvent.click(screen.getByText("Midstream"));
    const file = new File(["zip"], "inspection.zip", {
      type: "application/zip",
    });
    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() =>
      expect(onImportExcel).toHaveBeenCalledWith(file, {
        name: "inspection",
        type: "midstream",
      }),
    );
  });

  it("imports a hosted database from a scanned QR code", async () => {
    const file = new File(["zip"], "local-sync-import.zip", {
      type: "application/zip",
    });
    localSync.scanLocalSyncQr.mockResolvedValueOnce({
      host: "192.168.1.10",
      port: "54321",
      code: "123456",
      projectKey: "upstream:imported",
      syncId: "sync-12345678",
    });
    localSync.fetchLocalSyncArchive.mockResolvedValueOnce(file);
    const onImportZip = vi.fn().mockResolvedValue({});

    render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={onImportZip} />,
    );

    fireEvent.click(screen.getByText("QR Import by QR"));

    await waitFor(() =>
      expect(localSync.fetchLocalSyncArchive).toHaveBeenCalledWith({
        host: "192.168.1.10",
        port: "54321",
        code: "123456",
        projectKey: "upstream:imported",
        syncId: "sync-12345678",
      }),
    );
    await waitFor(() =>
      expect(onImportZip).toHaveBeenCalledWith(file, {
        name: "Imported",
        type: "upstream",
      }),
    );
  });

  it("allows selecting an Excel ZIP archive before choosing a project type", async () => {
    const onImportExcel = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportExcel={onImportExcel}
      />,
    );

    routing.detectImportKind.mockResolvedValue({ kind: "excel" });
    const file = new File(["zip"], "project.zip", {
      type: "application/zip",
    });
    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() =>
      expect(onImportExcel).toHaveBeenCalledWith(file, {
        name: "project",
        type: "",
      }),
    );
  });

  it("creates the first project with a trimmed name", () => {
    const onComplete = vi.fn();
    render(
      <ProjectSetupScreen onComplete={onComplete} onImportZip={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Project Name"), {
      target: { value: "  Alpha Field  " },
    });
    fireEvent.click(screen.getByText("Upstream"));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onComplete).toHaveBeenCalledWith("upstream", "Alpha Field");
  });

  it("submits from Enter after a project type is selected", () => {
    const onComplete = vi.fn();
    render(<ProjectSetupScreen onComplete={onComplete} />);

    fireEvent.click(screen.getByText("Downstream"));
    const input = screen.getByLabelText("Project Name");
    fireEvent.change(input, { target: { value: "City Network" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onComplete).toHaveBeenCalledWith("downstream", "City Network");
  });

  it("uses ZIP metadata to populate the import fallback", async () => {
    backupService.peekBackupZip.mockResolvedValueOnce({
      leaks: [{ id: "l1" }],
      meta: { project: { name: "Archive Project", type: "downstream" } },
      detectedType: null,
    });
    const onImportZip = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={onImportZip} />,
    );
    const file = new File(["zip"], "backup.zip", {
      type: "application/zip",
    });

    fireEvent.change(container.querySelector('input[accept^=".zip"]'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onImportZip).toHaveBeenCalledWith(file, {
        name: "Archive Project",
        type: "downstream",
      }),
    );
    expect(screen.getByLabelText("Project Name").value).toBe("Archive Project");
  });

  it("uses trusted ZIP metadata instead of a previously selected project type", async () => {
    backupService.peekBackupZip.mockResolvedValueOnce({
      leaks: [{ id: "l1" }],
      meta: { project: { name: "Archive Project", type: "downstream" } },
      detectedType: "downstream",
    });
    const onImportZip = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={onImportZip} />,
    );

    fireEvent.click(screen.getByText("Upstream"));
    const file = new File(["zip"], "backup.zip", {
      type: "application/zip",
    });
    fireEvent.change(container.querySelector('input[accept^=".zip"]'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onImportZip).toHaveBeenCalledWith(file, {
        name: "Archive Project",
        type: "downstream",
      }),
    );
  });

  it("falls back to the ZIP filename when preview and metadata are unavailable", async () => {
    backupService.peekBackupZip.mockRejectedValueOnce(new Error("bad preview"));
    const onImportZip = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={onImportZip} />,
    );
    const file = new File(["zip"], "midstream_backup.zip", {
      type: "application/zip",
    });

    fireEvent.change(container.querySelector('input[accept^=".zip"]'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onImportZip).toHaveBeenCalledWith(file, {
        name: "midstream_backup",
        type: "",
      }),
    );
  });

  it.each([
    ["MISSING_PROJECT_TYPE", "Select project type"],
    ["EMPTY_EXCEL", "No importable rows found in Excel"],
  ])("shows the mapped Excel error for %s", async (code, message) => {
    const error = Object.assign(new Error("raw import error"), { code });
    const onImportExcel = vi.fn().mockRejectedValue(error);
    const { container } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportExcel={onImportExcel} />,
    );
    routing.detectImportKind.mockResolvedValue({ kind: "excel" });
    const file = new File(["xlsx"], "inspection.xlsx");

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("silently handles QR cancellation and reports real scanner errors", async () => {
    const cancelled = Object.assign(new Error("cancelled"), {
      code: "QR_SCAN_CANCELLED",
    });
    localSync.scanLocalSyncQr.mockRejectedValueOnce(cancelled);
    const { unmount } = render(
      <ProjectSetupScreen onComplete={vi.fn()} onImportZip={vi.fn()} />,
    );

    fireEvent.click(screen.getByText("QR Import by QR"));
    await waitFor(() => expect(localSync.scanLocalSyncQr).toHaveBeenCalled());
    expect(screen.queryByText("cancelled")).toBeNull();
    unmount();

    localSync.scanLocalSyncQr.mockRejectedValueOnce(new Error("camera failed"));
    render(<ProjectSetupScreen onComplete={vi.fn()} onImportZip={vi.fn()} />);
    fireEvent.click(screen.getByText("QR Import by QR"));

    expect(await screen.findByText("camera failed")).toBeTruthy();
  });

  it("hides QR import when local sync is unavailable and cleans up on unmount", () => {
    localSync.isLocalSyncAvailable.mockReturnValue(false);
    const { unmount } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportExcel={vi.fn()}
      />,
    );

    expect(screen.queryByText("QR Import by QR")).toBeNull();
    unmount();
    expect(localSync.cancelLocalSyncQrScan).toHaveBeenCalledOnce();
  });

  describe("один файл, три вида", () => {
    const file = (name) => new File(["x"], name, { type: "application/zip" });

    it("узнаёт бэкап проекта и заводит из него проект", async () => {
      routing.detectImportKind.mockResolvedValue({ kind: "project" });
      const onImportZip = vi.fn().mockResolvedValue({});
      const { container } = render(
        <ProjectSetupScreen
          onComplete={vi.fn()}
          onImportZip={onImportZip}
          onImportExcel={vi.fn()}
          onImportInventory={vi.fn()}
        />,
      );

      fireEvent.change(fileInput(container), {
        target: { files: [file("backup.zip")] },
      });

      await waitFor(() => expect(onImportZip).toHaveBeenCalled());
    });

    it("заводит проект из архива инвентаризации", async () => {
      // Раньше он уходил в разбор бэкапа и получал «файл backup.json не
      // найден в архиве»: начать обход с переданной инвентаризации было нельзя.
      routing.detectImportKind.mockResolvedValue({ kind: "inventory" });
      const onImportInventory = vi.fn().mockResolvedValue({});
      const { container } = render(
        <ProjectSetupScreen
          onComplete={vi.fn()}
          onImportZip={vi.fn()}
          onImportInventory={onImportInventory}
        />,
      );

      const archive = file("!Inventorization_Бузахур.zip");
      fireEvent.change(fileInput(container), { target: { files: [archive] } });

      await waitFor(() =>
        // Имя проекта пишет сама выгрузка — набирать его заново незачем.
        expect(onImportInventory).toHaveBeenCalledWith(archive, {
          name: "Бузахур",
          type: "",
        }),
      );
    });

    it("говорит, что не понял файл, вместо чужой ошибки разбора", async () => {
      routing.detectImportKind.mockResolvedValue({ kind: "unknown" });
      const { container } = render(
        <ProjectSetupScreen
          onComplete={vi.fn()}
          onImportZip={vi.fn()}
          onImportExcel={vi.fn()}
        />,
      );

      fireEvent.change(fileInput(container), {
        target: { files: [file("notes.txt")] },
      });

      expect(
        await screen.findByText(/Could not tell what this file is/),
      ).toBeTruthy();
    });

    it("сообщает о пустом архиве инвентаризации его же словами", async () => {
      routing.detectImportKind.mockResolvedValue({ kind: "inventory" });
      const onImportInventory = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("raw"), { code: "EMPTY_INVENTORY" }),
        );
      const { container } = render(
        <ProjectSetupScreen
          onComplete={vi.fn()}
          onImportZip={vi.fn()}
          onImportInventory={onImportInventory}
        />,
      );

      fireEvent.change(fileInput(container), {
        target: { files: [file("!Inventorization_X.zip")] },
      });

      expect(
        await screen.findByText(/No component cards were found/),
      ).toBeTruthy();
    });
  });
});
