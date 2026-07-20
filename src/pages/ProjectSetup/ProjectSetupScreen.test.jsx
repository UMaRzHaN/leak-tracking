import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSetupScreen from "./ProjectSetupScreen";

const localSync = vi.hoisted(() => ({
  cancelLocalSyncQrScan: vi.fn(),
  fetchLocalSyncArchive: vi.fn(),
  isLocalSyncAvailable: vi.fn(() => true),
  scanLocalSyncQr: vi.fn(),
}));

vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({
    lang: "en",
    toggleLanguage: vi.fn(),
    t: (key, options) =>
      ({
        "projectSetup.title": "Leak Tracking",
        "projectSetup.subtitle": "Create your first project",
        "projectSetup.projectName": "Project Name",
        "projectSetup.projectType": "Project Type",
        "projectSetup.projectExample": "Example",
        "projectSetup.deviceFolder": "Device folder",
        "projectSetup.selectProjectType": "Select project type",
        "projectSetup.start": "Start",
        "projectSetup.or": "or",
        "projectSetup.import": "Import from ZIP",
        "projectSetup.importing": "Importing...",
        "projectSetup.importQr": "Import by QR",
        "projectSetup.importingQr": "Importing by QR...",
        "projectSetup.scanQrProgress":
          "Point the camera at the sync QR code...",
        "projectSetup.importQrProgress":
          "Downloading the database by QR, please wait...",
        "projectSetup.importExcel": "Import Excel",
        "projectSetup.importingExcel": "Importing Excel...",
        "projectSetup.importExcelProgress":
          "Reading the Excel archive, please wait...",
        "projectSetup.emptyExcel": "No importable rows found in Excel",
        "projectSetup.importHint": "Restore a project from a backup",
        "projectSetup.importError": "Import error",
        "projectSetup.languageToggle": "RU",
        "projectSetup.projectTypes.upstream.title": "Upstream",
        "projectSetup.projectTypes.upstream.description": "Production",
        "projectSetup.projectTypes.midstream.title": "Midstream",
        "projectSetup.projectTypes.midstream.description": "Transportation",
        "projectSetup.projectTypes.downstream.title": "Downstream",
        "projectSetup.projectTypes.downstream.description": "Processing",
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}));

vi.mock("@/services/localSyncService", () => localSync);

vi.mock("@/services/projectBackupService", () => ({
  peekBackupZip: vi.fn().mockResolvedValue({
    leaks: [],
    meta: { project: { name: "Imported", type: "upstream" } },
    detectedType: "upstream",
  }),
}));

const backupService = await import("@/services/projectBackupService");

describe("ProjectSetupScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localSync.isLocalSyncAvailable.mockReturnValue(true);
  });

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

  it("imports an Excel archive into a new project after selecting its type", async () => {
    const onImportExcel = vi.fn().mockResolvedValue({});
    const { container } = render(
      <ProjectSetupScreen
        onComplete={vi.fn()}
        onImportZip={vi.fn()}
        onImportExcel={onImportExcel}
      />,
    );

    fireEvent.click(screen.getByText("Midstream"));
    const input = container.querySelector('input[accept^=".xlsx"]');
    const file = new File(["zip"], "inspection.zip", {
      type: "application/zip",
    });
    fireEvent.change(input, { target: { files: [file] } });

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

    const input = container.querySelector('input[accept^=".xlsx"]');
    const file = new File(["zip"], "project.zip", {
      type: "application/zip",
    });
    fireEvent.change(input, { target: { files: [file] } });

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
    const file = new File(["xlsx"], "inspection.xlsx");

    fireEvent.change(container.querySelector('input[accept^=".xlsx"]'), {
      target: { files: [file] },
    });

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
});
