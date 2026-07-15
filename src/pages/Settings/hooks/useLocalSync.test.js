import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/localSyncService", () => ({
  cancelLocalSyncQrScan: vi.fn(),
  createLocalSyncQrSvg: vi.fn(),
  isLocalSyncAvailable: vi.fn(() => true),
  scanLocalSyncQr: vi.fn(),
  fetchLocalSyncArchive: vi.fn(),
  startLocalSyncHost: vi.fn(),
  exchangeLocalSyncArchive: vi.fn(),
}));

vi.mock("@/services/projectBackupService", () => ({
  buildProjectBackupZip: vi.fn(),
}));

const syncService = await import("@/services/localSyncService");
const backupService = await import("@/services/projectBackupService");
const { useLocalSync } = await import("./useLocalSync");

const activeProject = {
  id: "project-1",
  name: "Alpha Field",
  type: "upstream",
  folderName: "alpha-field",
  syncId: "sync-alpha-1234",
};

function renderSync(overrides = {}) {
  const notify = vi.fn();
  const onImportZip = vi
    .fn()
    .mockResolvedValue({ project: { name: "Imported" }, leakCount: 3 });
  const onImportIntoExisting = vi.fn().mockResolvedValue({ leakCount: 2 });
  const hook = renderHook(() =>
    useLocalSync({
      activeProject,
      data: [{ id: "leak-1" }],
      idbGetPhoto: vi.fn(),
      vars: {},
      onImportZip,
      onImportIntoExisting,
      notify,
      lang: "ru",
      ensureProjectSyncId: vi.fn(() => activeProject),
      ...overrides,
    }),
  );
  return { ...hook, notify, onImportZip, onImportIntoExisting };
}

describe("useLocalSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupService.buildProjectBackupZip.mockResolvedValue(
      new Blob(["local"], { type: "application/zip" }),
    );
    syncService.createLocalSyncQrSvg.mockResolvedValue("<svg />");
  });

  it("hosts an archive and merges the archive received from a peer", async () => {
    let receiveArchive;
    const stop = vi.fn().mockResolvedValue(undefined);
    syncService.startLocalSyncHost.mockImplementation(async (options) => {
      receiveArchive = options.onArchive;
      return { host: "192.168.43.1", port: 49152, code: "123456", stop };
    });
    const { result, onImportIntoExisting, notify } = renderSync();

    await act(async () => {
      await result.current.startHost();
    });

    expect(result.current.state).toMatchObject({
      status: "hosting",
      session: { host: "192.168.43.1", port: 49152, code: "123456" },
    });
    expect(syncService.startLocalSyncHost).toHaveBeenCalledWith(
      expect.objectContaining({ projectKey: "upstream:alpha field" }),
    );

    const incoming = new File(["remote"], "local-sync.zip", {
      type: "application/zip",
    });
    await act(async () => {
      await receiveArchive(incoming);
    });

    expect(onImportIntoExisting).toHaveBeenCalledWith(
      incoming,
      activeProject,
      "sync",
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe("complete");
    expect(notify).toHaveBeenCalledWith(
      "success",
      "Синхронизация завершена: применено изменений — 2",
    );
  });

  it("exchanges archives as a client and merges the response", async () => {
    const incoming = new File(["remote"], "local-sync.zip", {
      type: "application/zip",
    });
    syncService.exchangeLocalSyncArchive.mockResolvedValue(incoming);
    const { result, onImportIntoExisting } = renderSync();

    await act(async () => {
      await result.current.joinHost({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
      });
    });

    expect(syncService.exchangeLocalSyncArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
        projectKey: "upstream:alpha field",
      }),
    );
    expect(onImportIntoExisting).toHaveBeenCalledWith(
      incoming,
      activeProject,
      "sync",
    );
    expect(result.current.state.status).toBe("complete");
  });

  it("allows an empty matching project to receive its first sync", async () => {
    syncService.startLocalSyncHost.mockResolvedValue({
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
      stop: vi.fn().mockResolvedValue(undefined),
    });
    const { result } = renderSync({ data: [] });

    await act(async () => {
      await result.current.startHost();
    });

    expect(backupService.buildProjectBackupZip).toHaveBeenCalledWith(
      expect.objectContaining({ leaks: [] }),
    );
    expect(result.current.state.status).toBe("hosting");
  });

  it("uses the newly assigned sync id when a legacy host receives its first archive", async () => {
    const legacyProject = { ...activeProject, syncId: undefined };
    const upgradedProject = { ...activeProject, syncId: "assigned-sync-1234" };
    let receiveArchive;
    syncService.startLocalSyncHost.mockImplementation(async (options) => {
      receiveArchive = options.onArchive;
      return {
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
        stop: vi.fn().mockResolvedValue(undefined),
      };
    });
    const { result, onImportIntoExisting } = renderSync({
      activeProject: legacyProject,
      ensureProjectSyncId: vi.fn(() => upgradedProject),
    });

    await act(async () => result.current.startHost());
    const incoming = new File(["legacy-peer"], "local-sync.zip");
    await act(async () => receiveArchive(incoming));

    expect(onImportIntoExisting).toHaveBeenCalledWith(
      incoming,
      upgradedProject,
      "sync",
    );
  });

  it("scans a QR code and starts the client exchange", async () => {
    const incoming = new File(["remote"], "local-sync.zip", {
      type: "application/zip",
    });
    syncService.scanLocalSyncQr.mockResolvedValue({
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
    });
    syncService.exchangeLocalSyncArchive.mockResolvedValue(incoming);
    const { result } = renderSync();

    await act(async () => {
      await result.current.scanAndJoin();
    });

    expect(syncService.scanLocalSyncQr).toHaveBeenCalledWith({
      projectKey: "upstream:alpha field",
      syncId: "sync-alpha-1234",
    });
    expect(syncService.exchangeLocalSyncArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "192.168.43.1",
        port: "49152",
        code: "123456",
      }),
    );
    expect(result.current.state.status).toBe("complete");
  });

  it("scans a QR code and imports the hosted database without sending the local archive", async () => {
    const incoming = new File(["remote"], "local-sync-import.zip", {
      type: "application/zip",
    });
    const connection = {
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      projectKey: "upstream:remote field",
      syncId: "sync-remote-1234",
    };
    syncService.scanLocalSyncQr.mockResolvedValue(connection);
    syncService.fetchLocalSyncArchive.mockResolvedValue(incoming);
    const { result, onImportZip, onImportIntoExisting, notify } = renderSync();

    await act(async () => {
      await result.current.scanAndImport();
    });

    expect(syncService.scanLocalSyncQr).toHaveBeenCalledWith();
    expect(syncService.fetchLocalSyncArchive).toHaveBeenCalledWith(connection);
    expect(onImportZip).toHaveBeenCalledWith(incoming);
    expect(onImportIntoExisting).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("complete");
    expect(notify).toHaveBeenCalledWith(
      "success",
      "База импортирована по QR: «Imported» (3 записей)",
    );
  });
});
