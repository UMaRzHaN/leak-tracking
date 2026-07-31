import { act, renderHook, waitFor } from "@testing-library/react";
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
  streamProjectBackupZip: vi.fn(),
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
  const baseProps = {
    activeProject,
    data: [{ id: "leak-1" }],
    idbGetPhoto: vi.fn(),
    vars: {},
    onImportZip,
    onImportIntoExisting,
    notify,
    lang: "ru",
    ensureProjectSyncId: vi.fn(() => activeProject),
  };
  const hook = renderHook(
    (currentOverrides) =>
      useLocalSync({
        ...baseProps,
        ...currentOverrides,
      }),
    { initialProps: overrides },
  );
  return {
    ...hook,
    rerender: (nextOverrides = {}) =>
      hook.rerender({ ...overrides, ...nextOverrides }),
    notify,
    onImportZip,
    onImportIntoExisting,
  };
}

describe("useLocalSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupService.streamProjectBackupZip.mockImplementation(
      async ({ writeChunk }) => {
        await writeChunk(new Uint8Array([1, 2, 3]));
        return 3;
      },
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
      expect.objectContaining({
        projectKey: "upstream:alpha field",
        produceArchive: expect.any(Function),
      }),
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
        fingerprint: "A".repeat(64),
      });
    });

    expect(syncService.exchangeLocalSyncArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
        fingerprint: "A".repeat(64),
        projectKey: "upstream:alpha field",
        produceArchive: expect.any(Function),
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
      fingerprint: "A".repeat(64),
      stop: vi.fn().mockResolvedValue(undefined),
    });
    const { result } = renderSync({ data: [] });

    await act(async () => {
      await result.current.startHost();
    });

    const options = syncService.startLocalSyncHost.mock.calls[0][0];
    expect(options.produceArchive).toEqual(expect.any(Function));
    await options.produceArchive(vi.fn().mockResolvedValue(undefined));
    expect(backupService.streamProjectBackupZip).toHaveBeenCalledWith(
      expect.objectContaining({ leaks: [], writeChunk: expect.any(Function) }),
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
        fingerprint: "A".repeat(64),
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
      fingerprint: "A".repeat(64),
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
        fingerprint: "A".repeat(64),
      }),
    );
    expect(result.current.state.status).toBe("complete");
  });

  it("uses the QR sync id as the wire identity for a legacy client", async () => {
    const legacyProject = { ...activeProject, syncId: undefined };
    const connection = {
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha field",
      syncId: "host-sync-1234",
    };
    const incoming = new File(["remote"], "local-sync.zip", {
      type: "application/zip",
    });
    syncService.scanLocalSyncQr.mockResolvedValue(connection);
    syncService.exchangeLocalSyncArchive.mockResolvedValue(incoming);
    const { result, onImportIntoExisting } = renderSync({
      activeProject: legacyProject,
    });

    await act(async () => {
      await result.current.scanAndJoin();
    });

    expect(syncService.exchangeLocalSyncArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        syncId: connection.syncId,
        projectKey: "upstream:alpha field",
      }),
    );
    expect(onImportIntoExisting).toHaveBeenCalledWith(
      incoming,
      legacyProject,
      "sync",
    );
    expect(result.current.state.status).toBe("complete");
  });

  it("silently returns to idle when QR scanning is cancelled", async () => {
    const cancelError = new Error("cancelled");
    cancelError.code = "QR_SCAN_CANCELLED";
    syncService.scanLocalSyncQr.mockRejectedValue(cancelError);
    const { result, notify } = renderSync();

    await act(async () => {
      await result.current.scanAndJoin();
    });

    expect(result.current.state.status).toBe("idle");
    expect(syncService.exchangeLocalSyncArchive).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports QR scan errors before starting the client exchange", async () => {
    syncService.scanLocalSyncQr.mockRejectedValue(
      new Error("QR-код относится к другой базе данных"),
    );
    const { result, notify } = renderSync();

    await act(async () => {
      await result.current.scanAndJoin();
    });

    expect(result.current.state.status).toBe("idle");
    expect(syncService.exchangeLocalSyncArchive).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Ошибка QR-кода: QR-код относится к другой базе данных",
    );
  });

  it("scans a QR code and imports the hosted database without sending the local archive", async () => {
    const incoming = new File(["remote"], "local-sync-import.zip", {
      type: "application/zip",
    });
    const connection = {
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      fingerprint: "A".repeat(64),
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

  it("returns to idle when a sync id cannot be assigned", async () => {
    const { result, notify } = renderSync({
      lang: "en",
      ensureProjectSyncId: vi.fn(() => null),
    });

    await act(async () => result.current.startHost());

    expect(syncService.startLocalSyncHost).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Could not create session"),
    );
  });

  it("stops a hosted session explicitly", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    syncService.startLocalSyncHost.mockResolvedValue({
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      stop,
    });
    const { result } = renderSync({ lang: "en" });

    await act(async () => result.current.startHost());
    await act(async () => result.current.stopHost());

    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe("idle");
  });

  it("stops and reports asynchronous host errors", async () => {
    let reportError;
    const stop = vi.fn().mockResolvedValue(undefined);
    syncService.startLocalSyncHost.mockImplementation(async (options) => {
      reportError = options.onError;
      return {
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        stop,
      };
    });
    const { result, notify } = renderSync({ lang: "en" });

    await act(async () => result.current.startHost());
    act(() => reportError(new Error("peer disconnected")));

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(result.current.state.status).toBe("idle");
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Local sync error: peer disconnected",
    );
  });

  it("reports client exchange failures", async () => {
    syncService.exchangeLocalSyncArchive.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const { result, notify } = renderSync({ lang: "en" });

    await act(async () =>
      result.current.joinHost({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
        fingerprint: "A".repeat(64),
      }),
    );

    expect(result.current.state.status).toBe("idle");
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Connection error: connection refused",
    );
  });

  it("silently handles QR cancellation but reports invalid QR codes", async () => {
    const cancelled = Object.assign(new Error("cancelled"), {
      code: "QR_SCAN_CANCELLED",
    });
    syncService.scanLocalSyncQr.mockRejectedValueOnce(cancelled);
    const { result, notify } = renderSync({ lang: "en" });

    await act(async () => result.current.scanAndJoin());
    expect(notify).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");

    syncService.scanLocalSyncQr.mockRejectedValueOnce(new Error("wrong code"));
    await act(async () => result.current.scanAndJoin());
    expect(notify).toHaveBeenCalledWith("error", "QR code error: wrong code");
  });

  it("cancels scanning and cleans up native resources on unmount", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    syncService.startLocalSyncHost.mockResolvedValue({
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      stop,
    });
    const { result, unmount } = renderSync({ lang: "en" });

    act(() => result.current.cancelScan());
    expect(syncService.cancelLocalSyncQrScan).toHaveBeenCalledOnce();

    await act(async () => result.current.startHost());
    unmount();

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(syncService.cancelLocalSyncQrScan).toHaveBeenCalledTimes(2);
  });

  it("stops a hosted session and ignores its late archive after switching projects", async () => {
    let receiveArchive;
    const stop = vi.fn().mockResolvedValue(undefined);
    syncService.startLocalSyncHost.mockImplementation(async (options) => {
      receiveArchive = options.onArchive;
      return {
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        stop,
      };
    });
    const { result, rerender, onImportIntoExisting } = renderSync();

    await act(async () => result.current.startHost());
    rerender({
      activeProject: {
        ...activeProject,
        id: "project-2",
        name: "Beta Field",
        folderName: "beta-field",
        syncId: "sync-beta-1234",
      },
    });

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(result.current.state.status).toBe("idle");

    await act(async () => {
      await receiveArchive(new File(["late"], "late.zip"));
    });

    expect(onImportIntoExisting).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });

  it("does not merge a client response that arrives after switching projects", async () => {
    let resolveExchange;
    syncService.exchangeLocalSyncArchive.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExchange = resolve;
        }),
    );
    const { result, rerender, onImportIntoExisting } = renderSync();
    let joining;

    act(() => {
      joining = result.current.joinHost({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
        fingerprint: "A".repeat(64),
      });
    });
    await waitFor(() =>
      expect(syncService.exchangeLocalSyncArchive).toHaveBeenCalledOnce(),
    );

    rerender({
      activeProject: {
        ...activeProject,
        id: "project-2",
        name: "Beta Field",
        folderName: "beta-field",
        syncId: "sync-beta-1234",
      },
    });
    expect(result.current.state.status).toBe("idle");

    await act(async () => {
      resolveExchange(new File(["late"], "late-response.zip"));
      await joining;
    });

    expect(onImportIntoExisting).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });

  it("silently returns to idle when QR import scanning is cancelled", async () => {
    const cancelError = new Error("cancelled");
    cancelError.code = "QR_SCAN_CANCELLED";
    syncService.scanLocalSyncQr.mockRejectedValue(cancelError);
    const { result, onImportZip, notify } = renderSync();

    await act(async () => {
      await result.current.scanAndImport();
    });

    expect(result.current.state.status).toBe("idle");
    expect(syncService.fetchLocalSyncArchive).not.toHaveBeenCalled();
    expect(onImportZip).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports QR import download errors without importing a partial archive", async () => {
    syncService.scanLocalSyncQr.mockResolvedValue({
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:remote field",
      syncId: "sync-remote-1234",
    });
    syncService.fetchLocalSyncArchive.mockRejectedValue(
      new Error("Не удалось прочитать полученный архив (404)"),
    );
    const { result, onImportZip, notify } = renderSync();

    await act(async () => {
      await result.current.scanAndImport();
    });

    expect(result.current.state.status).toBe("idle");
    expect(onImportZip).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Ошибка импорта по QR: Не удалось прочитать полученный архив (404)",
    );
  });

  it("shows a localized type mismatch instead of a generic connection error", async () => {
    const mismatch = Object.assign(new Error("mismatch"), {
      code: "PROJECT_TYPE_MISMATCH",
      existingProjectType: "upstream",
      incomingProjectType: "downstream",
    });
    syncService.exchangeLocalSyncArchive.mockRejectedValueOnce(mismatch);
    const { result, notify } = renderSync({ lang: "en" });

    await act(async () =>
      result.current.joinHost({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
        fingerprint: "A".repeat(64),
      }),
    );

    expect(result.current.state.status).toBe("idle");
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Projects of different types cannot be synchronized: current — Upstream, received — Downstream.",
    );
  });

  it("reports a missing archive project type during hosted synchronization", async () => {
    let receiveArchive;
    const stop = vi.fn().mockResolvedValue(undefined);
    syncService.startLocalSyncHost.mockImplementation(async (options) => {
      receiveArchive = options.onArchive;
      return {
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        stop,
      };
    });
    const missing = Object.assign(new Error("missing"), {
      code: "PROJECT_TYPE_MISSING",
    });
    const { result, onImportIntoExisting, notify } = renderSync({ lang: "ru" });
    onImportIntoExisting.mockRejectedValueOnce(missing);

    await act(async () => result.current.startHost());
    await act(async () => {
      await expect(
        receiveArchive(new File(["remote"], "remote.zip")),
      ).rejects.toMatchObject({ code: "PROJECT_TYPE_MISSING" });
    });

    expect(stop).toHaveBeenCalledOnce();
    // onArchive deliberately propagates import failures; the host-level error
    // callback is responsible for displaying the localized message.
    const hostCall = syncService.startLocalSyncHost.mock.calls[0][0];
    act(() => hostCall.onError(missing));
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Полученный архив не содержит тип проекта. Синхронизация отменена.",
    );
  });

  it("reports a missing current project type during client synchronization", async () => {
    const missing = Object.assign(new Error("missing current type"), {
      code: "CURRENT_PROJECT_TYPE_MISSING",
    });
    syncService.exchangeLocalSyncArchive.mockRejectedValueOnce(missing);
    const { result, notify } = renderSync({ lang: "en" });

    await act(async () =>
      result.current.joinHost({
        host: "192.168.43.1",
        port: "49152",
        code: "654321",
        fingerprint: "A".repeat(64),
      }),
    );

    expect(notify).toHaveBeenCalledWith(
      "error",
      "The current project has no defined type. Synchronization was cancelled.",
    );
  });
});
