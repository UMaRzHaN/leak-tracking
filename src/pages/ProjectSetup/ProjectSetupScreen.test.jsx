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
});
