import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const QR_SESSION = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: 4_102_444_800_000,
};

// The QR half talks to the scanner and to the platform check, and to nothing
// else — no LocalSync plugin, no archive. That is the whole reason it is its
// own module, and this preamble is what that separation looks like from here.
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
  },
}));

vi.mock("@capacitor-mlkit/barcode-scanning", () => ({
  BarcodeFormat: { QrCode: "QR_CODE" },
  BarcodeScanner: barcodeMocks,
}));

const {
  buildLocalSyncQrPayload,
  cancelLocalSyncQrScan,
  createLocalSyncQrSvg,
  parseLocalSyncQrPayload,
  scanLocalSyncQr,
} = await import("./localSyncQr");

describe("localSyncQr", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    barcodeMocks.addListener.mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    });
    barcodeMocks.isSupported.mockResolvedValue({ supported: true });
    barcodeMocks.requestPermissions.mockResolvedValue({ camera: "granted" });
    barcodeMocks.startScan.mockResolvedValue(undefined);
    barcodeMocks.stopScan.mockResolvedValue(undefined);
  });

  it("round-trips a local session through its QR payload", async () => {
    const payload = buildLocalSyncQrPayload({
      ...QR_SESSION,
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
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
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      ...QR_SESSION,
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
      {
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        ...QR_SESSION,
      },
      { projectKey: "upstream:alpha", syncId: "sync-alpha-1234" },
    );
    expect(svg).toContain("<svg");
  });

  it("rejects malformed and mismatched QR payloads", () => {
    expect(() =>
      parseLocalSyncQrPayload("https://example.test", null),
    ).toThrow();
    expect(() =>
      parseLocalSyncQrPayload("leak-tracker-sync:{broken", null),
    ).toThrow();

    const invalidConnection = `leak-tracker-sync:${JSON.stringify({
      version: 4,
      ...QR_SESSION,
      host: "",
      port: 70000,
      code: "12",
      fingerprint: "A".repeat(64),
      syncId: "sync-alpha-1234",
    })}`;
    expect(() => parseLocalSyncQrPayload(invalidConnection, null)).toThrow();

    const missingSyncId = buildLocalSyncQrPayload({
      ...QR_SESSION,
      host: "192.168.1.2",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha",
    });
    expect(() => parseLocalSyncQrPayload(missingSyncId, null)).toThrow();

    const otherDatabase = buildLocalSyncQrPayload({
      ...QR_SESSION,
      host: "192.168.1.2",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha",
      syncId: "sync-other-1234",
    });
    expect(() =>
      parseLocalSyncQrPayload(otherDatabase, {
        syncId: "sync-alpha-1234",
      }),
    ).toThrow();
  });

  it("reports unsupported scanning and denied camera permission", async () => {
    barcodeMocks.isSupported.mockResolvedValueOnce({ supported: false });
    await expect(scanLocalSyncQr()).rejects.toThrow();
    expect(barcodeMocks.requestPermissions).not.toHaveBeenCalled();

    barcodeMocks.requestPermissions.mockResolvedValueOnce({ camera: "denied" });
    await expect(scanLocalSyncQr()).rejects.toThrow();
    expect(barcodeMocks.startScan).not.toHaveBeenCalled();
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
            version: 4,
            ...QR_SESSION,
            host: "192.168.43.1",
            port: 70000,
            code: "123456",
            fingerprint: "A".repeat(64),
            projectKey: "upstream:alpha",
            syncId: "sync-alpha-1234",
          }),
      ),
    ).toThrow("QR-код содержит некорректные параметры подключения");
    expect(() =>
      parseLocalSyncQrPayload(
        "leak-tracker-sync:" +
          JSON.stringify({
            version: 4,
            ...QR_SESSION,
            host: "192.168.43.1",
            port: 49152,
            code: "123456",
            fingerprint: "A".repeat(64),
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
          ...QR_SESSION,
          host: " 192.168.43.1 ",
          port: 49152,
          code: "123456",
          fingerprint: "A".repeat(64),
          projectKey: "upstream:alpha",
          syncId: "sync-alpha-1234",
        }),
      },
    });

    await expect(scanning).resolves.toEqual({
      host: "192.168.43.1",
      port: "49152",
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      ...QR_SESSION,
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
          ...QR_SESSION,
          host: "192.168.43.1",
          port: 49152,
          code: "123456",
          fingerprint: "A".repeat(64),
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
});
