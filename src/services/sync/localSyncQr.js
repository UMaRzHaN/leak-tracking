import { assertNativeAndroid } from "@/services/sync/localSyncPlatform";
import { ignoredError } from "@/utils/ignoredError";

/**
 * The QR half of local sync: the payload two phones agree on, and the scan that
 * reads it.
 *
 * It sits apart from the archive transfer because it shares nothing with it but
 * the platform check — no plugin, no session, no archive. Keeping the two in one
 * module put that file at its line ceiling, where the next change had nowhere
 * to go.
 */

const QR_PREFIX = "leak-tracker-sync:";
const QR_VERSION = 4;

// Teardown after a scan that is already over. A listener that refuses to detach
// must not fail the scan that succeeded, but a scanner left running is worth
// knowing about.
const ignoreListener = ignoredError("localSync.removeListener");
const ignoreStopScan = ignoredError("localSync.stopScan");

// One scan at a time, and the generation is what tells a scan that started
// before a cancellation that it is no longer the current one.
let activeQrScanCancel = null;
let qrScanGeneration = 0;

function cancelledScanError() {
  const error = new Error("Сканирование отменено");
  error.code = "QR_SCAN_CANCELLED";
  return error;
}

export function buildLocalSyncQrPayload({
  host,
  port,
  code,
  fingerprint,
  projectKey,
  syncId,
  sessionId,
  expiresAt,
}) {
  return `${QR_PREFIX}${JSON.stringify({
    version: QR_VERSION,
    host,
    port: Number(port),
    code,
    fingerprint,
    projectKey,
    syncId,
    sessionId,
    expiresAt: Number(expiresAt),
  })}`;
}

export function parseLocalSyncQrPayload(value, expectedIdentity) {
  if (typeof value !== "string" || !value.startsWith(QR_PREFIX)) {
    throw new Error("Это не QR-код Leak Tracker");
  }

  let payload;
  try {
    payload = JSON.parse(value.slice(QR_PREFIX.length));
  } catch {
    throw new Error("QR-код синхронизации повреждён");
  }

  if (payload?.version !== QR_VERSION) {
    throw new Error("QR-код создан в несовместимой версии приложения");
  }

  const validPort =
    Number.isInteger(payload?.port) &&
    payload.port > 0 &&
    payload.port <= 65535;
  const validCode = /^\d{6}$/.test(String(payload?.code ?? ""));
  const validHost =
    typeof payload?.host === "string" && payload.host.trim().length > 0;
  const validFingerprint = /^[0-9a-f]{64}$/i.test(
    String(payload?.fingerprint ?? ""),
  );
  const validSessionId =
    typeof payload?.sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.sessionId,
    );
  const validExpiresAt =
    Number.isSafeInteger(payload?.expiresAt) && payload.expiresAt > 0;
  if (
    !validHost ||
    !validPort ||
    !validCode ||
    !validFingerprint ||
    !validSessionId ||
    !validExpiresAt
  ) {
    throw new Error("QR-код содержит некорректные параметры подключения");
  }
  const expectedProjectKey =
    typeof expectedIdentity === "string"
      ? expectedIdentity
      : expectedIdentity?.projectKey;
  const expectedSyncId =
    typeof expectedIdentity === "object" ? expectedIdentity?.syncId : null;
  const validSyncId =
    typeof payload.syncId === "string" && payload.syncId.trim().length >= 8;
  if (!validSyncId) {
    throw new Error("QR-код не содержит идентификатор проекта");
  }
  if (expectedSyncId) {
    if (payload.syncId !== expectedSyncId) {
      throw new Error("QR-код относится к другой базе данных");
    }
  } else if (expectedProjectKey && payload.projectKey !== expectedProjectKey) {
    throw new Error("QR-код создан для другого проекта");
  }

  return {
    host: payload.host.trim(),
    port: String(payload.port),
    code: String(payload.code),
    fingerprint: payload.fingerprint.toUpperCase(),
    projectKey: payload.projectKey,
    syncId: payload.syncId,
    sessionId: payload.sessionId,
    expiresAt: payload.expiresAt,
  };
}

export async function createLocalSyncQrSvg(session, identity) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(buildLocalSyncQrPayload({ ...session, ...identity }), {
    type: "svg",
    width: 232,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#101827", light: "#ffffff" },
  });
}

export async function scanLocalSyncQr(expectedIdentity) {
  assertNativeAndroid();
  const previousCancel = activeQrScanCancel;
  const generation = ++qrScanGeneration;
  const assertScanActive = () => {
    if (generation !== qrScanGeneration) throw cancelledScanError();
  };
  await previousCancel?.();
  assertScanActive();
  const { BarcodeFormat, BarcodeScanner } =
    await import("@capacitor-mlkit/barcode-scanning");
  assertScanActive();
  const { supported } = await BarcodeScanner.isSupported();
  assertScanActive();
  if (!supported) {
    throw new Error("Сканирование QR не поддерживается на этом телефоне");
  }

  const { camera } = await BarcodeScanner.requestPermissions();
  assertScanActive();
  if (camera !== "granted" && camera !== "limited") {
    throw new Error("Разрешите приложению использовать камеру");
  }

  document.body.classList.add("local-sync-scanner-active");

  return new Promise((resolve, reject) => {
    let barcodeListener;
    let errorListener;
    let finished = false;

    const cleanup = async () => {
      document.body.classList.remove("local-sync-scanner-active");
      activeQrScanCancel = null;
      await barcodeListener?.remove().catch(ignoreListener);
      await errorListener?.remove().catch(ignoreListener);
      await BarcodeScanner.stopScan().catch(ignoreStopScan);
    };
    /** @param {Function} callback @param {any} value */
    const finish = async (callback, value) => {
      if (finished) return;
      finished = true;
      await cleanup();
      callback(value);
    };

    activeQrScanCancel = () => {
      return finish(reject, cancelledScanError());
    };

    const startScanner = async () => {
      try {
        const nextBarcodeListener = await /** @type {any} */ (
          BarcodeScanner
        ).addListener("barcodeScanned", (event) => {
          const barcode = event.barcode ?? event.barcodes?.[0];
          const value = barcode?.rawValue ?? barcode?.displayValue;
          if (!value) return;
          try {
            void finish(
              resolve,
              parseLocalSyncQrPayload(value, expectedIdentity),
            );
          } catch (error) {
            void finish(reject, error);
          }
        });
        if (finished) {
          await nextBarcodeListener.remove().catch(ignoreListener);
          return;
        }
        barcodeListener = nextBarcodeListener;

        const nextErrorListener = await BarcodeScanner.addListener(
          "scanError",
          ({ message }) => void finish(reject, new Error(message)),
        );
        if (finished) {
          await nextErrorListener.remove().catch(ignoreListener);
          return;
        }
        errorListener = nextErrorListener;
        await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
        if (finished) await BarcodeScanner.stopScan().catch(ignoreStopScan);
      } catch (error) {
        await finish(reject, error);
      }
    };

    void startScanner();
  });
}

export async function cancelLocalSyncQrScan() {
  qrScanGeneration += 1;
  await activeQrScanCancel?.();
}
