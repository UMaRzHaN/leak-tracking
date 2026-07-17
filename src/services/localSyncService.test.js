import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const remove = vi.fn().mockResolvedValue(undefined);
  return {
    remove,
    plugin: {
      addListener: vi.fn().mockResolvedValue({ remove }),
      prepareArchive: vi.fn().mockResolvedValue({
        token: "archive-token",
        maxArchiveBytes: 64 * 1024 * 1024,
      }),
      appendArchiveChunk: vi.fn().mockResolvedValue({}),
      discardArchive: vi.fn().mockResolvedValue({}),
      releaseReceivedArchive: vi.fn().mockResolvedValue({}),
      startHost: vi.fn().mockResolvedValue({
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
      }),
      stopHost: vi.fn().mockResolvedValue({}),
      exchange: vi.fn(),
      fetchArchive: vi.fn(),
    },
  };
});

const barcodeMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  isSupported: vi.fn().mockResolvedValue({ supported: true }),
  requestPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
  startScan: vi.fn().mockResolvedValue(undefined),
  stopScan: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    convertFileSrc: vi.fn((uri) => uri),
  },
  registerPlugin: vi.fn(() => mocks.plugin),
}));

vi.mock("@capacitor-mlkit/barcode-scanning", () => ({
  BarcodeFormat: { QrCode: "QR_CODE" },
  BarcodeScanner: barcodeMocks,
}));

const {
  buildLocalSyncQrPayload,
  createLocalSyncQrSvg,
  parseLocalSyncQrPayload,
  cancelLocalSyncQrScan,
  exchangeLocalSyncArchive,
  fetchLocalSyncArchive,
  scanLocalSyncQr,
  startLocalSyncHost,
} = await import("./localSyncService");

describe("localSyncService", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plugin.addListener.mockResolvedValue({ remove: mocks.remove });
    mocks.plugin.prepareArchive.mockResolvedValue({
      token: "archive-token",
      maxArchiveBytes: 64 * 1024 * 1024,
    });
    mocks.plugin.appendArchiveChunk.mockResolvedValue({});
    mocks.plugin.startHost.mockResolvedValue({
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
    });
    barcodeMocks.addListener.mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    });
    barcodeMocks.isSupported.mockResolvedValue({ supported: true });
    barcodeMocks.requestPermissions.mockResolvedValue({ camera: "granted" });
    barcodeMocks.startScan.mockResolvedValue(undefined);
    barcodeMocks.stopScan.mockResolvedValue(undefined);
  });

  it("prepares a large archive in bounded chunks before opening a host", async () => {
    const archive = new Blob([new Uint8Array(1024 * 1024 + 100)]);

    const session = await startLocalSyncHost({
      archive,
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      onArchive: vi.fn(),
      onError: vi.fn(),
    });

    expect(mocks.plugin.prepareArchive).toHaveBeenCalledOnce();
    expect(mocks.plugin.appendArchiveChunk).toHaveBeenCalledTimes(3);
    expect(mocks.plugin.startHost).toHaveBeenCalledWith({
      archiveToken: "archive-token",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });

    await session.stop();
    expect(mocks.plugin.stopHost).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });

  it("round-trips a local session through its QR payload", async () => {
    const payload = buildLocalSyncQrPayload({
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });

    expect(
      parseLocalSyncQrPayload(payload, {
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
      }),
    ).toEqual({
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    expect(() => parseLocalSyncQrPayload(payload, "upstream:beta")).toThrow(
      "QR-код создан для другого проекта",
    );
    expect(
      parseLocalSyncQrPayload(payload, {
        projectKey: "upstream:renamed project",
        syncId: "sync-alpha-1234",
      }),
    ).toMatchObject({ syncId: "sync-alpha-1234" });

    const svg = await createLocalSyncQrSvg(
      { host: "192.168.43.1", port: 49152, code: "123456" },
      { projectKey: "upstream:alpha", syncId: "sync-alpha-1234" },
    );
    expect(svg).toContain("<svg");
  });

  it("rejects malformed and incomplete QR payloads before starting sync", () => {
    expect(() => parseLocalSyncQrPayload("not-a-leak-tracker-code")).toThrow(
      "Это не QR-код Leak Tracker",
    );
    expect(() => parseLocalSyncQrPayload("leak-tracker-sync:{oops")).toThrow(
      "QR-код синхронизации повреждён",
    );
    expect(() =>
      parseLocalSyncQrPayload(
        "leak-tracker-sync:" +
          JSON.stringify({
            version: 1,
            host: "192.168.43.1",
            port: 70000,
            code: "123456",
            projectKey: "upstream:alpha",
            syncId: "sync-alpha-1234",
          }),
      ),
    ).toThrow("QR-код содержит некорректные параметры подключения");
    expect(() =>
      parseLocalSyncQrPayload(
        "leak-tracker-sync:" +
          JSON.stringify({
            version: 1,
            host: "192.168.43.1",
            port: 49152,
            code: "123456",
            projectKey: "upstream:alpha",
          }),
      ),
    ).toThrow("QR-код не содержит идентификатор проекта");
  });

  it("resolves scanned QR codes and cleans up scanner listeners", async () => {
    let barcodeCallback;
    const barcodeRemove = vi.fn().mockResolvedValue(undefined);
    const errorRemove = vi.fn().mockResolvedValue(undefined);
    barcodeMocks.addListener.mockImplementation(async (eventName, callback) => {
      if (eventName === "barcodeScanned") {
        barcodeCallback = callback;
        return { remove: barcodeRemove };
      }
      if (eventName === "scanError") {
        return { remove: errorRemove };
      }
      throw new Error(`Unexpected listener: ${eventName}`);
    });

    const scanning = scanLocalSyncQr({
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    await vi.waitFor(() => expect(barcodeMocks.startScan).toHaveBeenCalled());

    barcodeCallback({
      barcode: {
        rawValue: buildLocalSyncQrPayload({
          host: " 192.168.43.1 ",
          port: 49152,
          code: "123456",
          projectKey: "upstream:alpha",
          syncId: "sync-alpha-1234",
        }),
      },
    });

    await expect(scanning).resolves.toEqual({
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    expect(barcodeRemove).toHaveBeenCalledOnce();
    expect(errorRemove).toHaveBeenCalledOnce();
    expect(barcodeMocks.stopScan).toHaveBeenCalledOnce();
    expect(document.body.classList.contains("local-sync-scanner-active")).toBe(
      false,
    );
  });

  it("rejects scanned QR codes from another database and stops scanning", async () => {
    let barcodeCallback;
    const barcodeRemove = vi.fn().mockResolvedValue(undefined);
    const errorRemove = vi.fn().mockResolvedValue(undefined);
    barcodeMocks.addListener.mockImplementation(async (eventName, callback) => {
      if (eventName === "barcodeScanned") {
        barcodeCallback = callback;
        return { remove: barcodeRemove };
      }
      return { remove: errorRemove };
    });

    const scanning = scanLocalSyncQr({
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    await vi.waitFor(() => expect(barcodeMocks.startScan).toHaveBeenCalled());

    barcodeCallback({
      barcode: {
        rawValue: buildLocalSyncQrPayload({
          host: "192.168.43.1",
          port: 49152,
          code: "123456",
          projectKey: "upstream:alpha",
          syncId: "sync-beta-9999",
        }),
      },
    });

    await expect(scanning).rejects.toThrow(
      "QR-код относится к другой базе данных",
    );
    expect(barcodeRemove).toHaveBeenCalledOnce();
    expect(errorRemove).toHaveBeenCalledOnce();
    expect(barcodeMocks.stopScan).toHaveBeenCalledOnce();
  });

  it("propagates native scanner errors and cleans up the active scan", async () => {
    let errorCallback;
    const barcodeRemove = vi.fn().mockResolvedValue(undefined);
    const errorRemove = vi.fn().mockResolvedValue(undefined);
    barcodeMocks.addListener.mockImplementation(async (eventName, callback) => {
      if (eventName === "scanError") {
        errorCallback = callback;
        return { remove: errorRemove };
      }
      return { remove: barcodeRemove };
    });

    const scanning = scanLocalSyncQr({
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    await vi.waitFor(() => expect(barcodeMocks.startScan).toHaveBeenCalled());

    errorCallback({ message: "Camera unavailable" });

    await expect(scanning).rejects.toThrow("Camera unavailable");
    expect(barcodeRemove).toHaveBeenCalledOnce();
    expect(errorRemove).toHaveBeenCalledOnce();
    expect(barcodeMocks.stopScan).toHaveBeenCalledOnce();
  });

  it("does not reopen the camera when scanning is cancelled during listener setup", async () => {
    let resolveListener;
    const remove = vi.fn().mockResolvedValue(undefined);
    barcodeMocks.addListener.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveListener = () => resolve({ remove });
      }),
    );

    const scanning = scanLocalSyncQr({
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    const rejected = expect(scanning).rejects.toMatchObject({
      code: "QR_SCAN_CANCELLED",
    });
    await vi.waitFor(() => expect(barcodeMocks.addListener).toHaveBeenCalled());
    const cancelling = cancelLocalSyncQrScan();
    resolveListener();
    await cancelling;
    await rejected;

    expect(remove).toHaveBeenCalledOnce();
    expect(barcodeMocks.startScan).not.toHaveBeenCalled();
    expect(document.body.classList.contains("local-sync-scanner-active")).toBe(
      false,
    );
  });

  it("does not start the camera after leaving during the permission request", async () => {
    let resolvePermission;
    barcodeMocks.requestPermissions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermission = () => resolve({ camera: "granted" });
      }),
    );
    const scanning = scanLocalSyncQr({
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    const rejected = expect(scanning).rejects.toMatchObject({
      code: "QR_SCAN_CANCELLED",
    });
    await vi.waitFor(() =>
      expect(barcodeMocks.requestPermissions).toHaveBeenCalled(),
    );

    await cancelLocalSyncQrScan();
    resolvePermission();
    await rejected;

    expect(barcodeMocks.addListener).not.toHaveBeenCalled();
    expect(barcodeMocks.startScan).not.toHaveBeenCalled();
    expect(document.body.classList.contains("local-sync-scanner-active")).toBe(
      false,
    );
  });

  it("honors an immediate cancellation before scanner preflight completes", async () => {
    const scanning = scanLocalSyncQr({
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    const rejected = expect(scanning).rejects.toMatchObject({
      code: "QR_SCAN_CANCELLED",
    });

    await cancelLocalSyncQrScan();
    await rejected;

    expect(barcodeMocks.startScan).not.toHaveBeenCalled();
  });

  it("releases the native temporary archive after reading it", async () => {
    mocks.plugin.exchange.mockResolvedValue({
      uri: "file:///cache/incoming.zip",
      archiveToken: "received-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["zip"])),
      }),
    );

    await exchangeLocalSyncArchive({
      host: "192.168.1.2",
      port: 49152,
      code: "123456",
      archive: new Blob(["outgoing"]),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });

    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "received-token",
    });
    vi.unstubAllGlobals();
  });

  it("fetches a hosted archive for QR import without preparing an outgoing archive", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "file:///cache/import.zip",
      archiveToken: "import-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["zip"])),
      }),
    );

    await fetchLocalSyncArchive({
      host: "192.168.1.2",
      port: "49152",
      code: "123456",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });

    expect(mocks.plugin.prepareArchive).not.toHaveBeenCalled();
    expect(mocks.plugin.fetchArchive).toHaveBeenCalledWith({
      host: "192.168.1.2",
      port: 49152,
      code: "123456",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
    });
    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "import-token",
    });
    vi.unstubAllGlobals();
  });
});
