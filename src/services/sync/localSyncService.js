import { Capacitor, registerPlugin } from "@capacitor/core";
import { assertImportFileSize, IMPORT_LIMITS } from "@/utils/importLimits";
import { syncError } from "@/services/sync/localSyncFailures";

const LocalSync = registerPlugin("LocalSync");
const ARCHIVE_CHUNK_BYTES = 512 * 1024;
const QR_PREFIX = "leak-tracker-sync:";
const QR_VERSION = 4;
export const LOCAL_SYNC_SESSION_DURATION_MS = 3 * 60 * 1000;
let activeQrScanCancel = null;
let qrScanGeneration = 0;

function cancelledScanError() {
  return syncError("QR_SCAN_CANCELLED");
}

function assertNativeAndroid() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw syncError("SYNC_ANDROID_ONLY");
  }
}

function normalizeSessionId(value) {
  const sessionId = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId,
    )
  ) {
    throw syncError("QR_SESSION_ID_INVALID");
  }
  return sessionId;
}

function blobChunkToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? syncError("ARCHIVE_READ_FAILED"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const separator = value.indexOf(",");
      if (separator < 0) {
        reject(syncError("ARCHIVE_PREPARE_FAILED"));
        return;
      }
      resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function toBlob(value) {
  if (value instanceof Blob) return value;
  if (value instanceof Uint8Array) {
    return new Blob([value.slice().buffer]);
  }
  if (value instanceof ArrayBuffer) return new Blob([value]);
  throw new TypeError(
    "Archive chunk must be a Blob, Uint8Array or ArrayBuffer",
  );
}

async function prepareNativeArchive({ archive, produceArchive }) {
  if (!(archive instanceof Blob) && typeof produceArchive !== "function") {
    throw new TypeError("archive or produceArchive is required");
  }
  const prepared = await LocalSync.prepareArchive();
  const token = prepared?.token;
  const nativeLimit = Number(prepared?.maxArchiveBytes);
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    !Number.isSafeInteger(nativeLimit) ||
    nativeLimit <= 0
  ) {
    if (typeof token === "string" && token) {
      await LocalSync.discardArchive({ token }).catch(() => {});
    }
    throw syncError("ARCHIVE_LIMIT_INVALID");
  }

  const maxArchiveBytes = Math.min(nativeLimit, IMPORT_LIMITS.maxFileBytes);
  let writtenBytes = 0;
  try {
    const append = async (value) => {
      const blob = toBlob(value);
      for (let offset = 0; offset < blob.size; offset += ARCHIVE_CHUNK_BYTES) {
        const chunk = blob.slice(offset, offset + ARCHIVE_CHUNK_BYTES);
        if (writtenBytes + chunk.size > maxArchiveBytes) {
          throw syncError(
            "ARCHIVE_TOO_LARGE",
            `Архив синхронизации больше ${Math.floor(maxArchiveBytes / 1024 / 1024)} МБ`,
          );
        }
        const chunkBase64 = await blobChunkToBase64(chunk);
        await LocalSync.appendArchiveChunk({ token, chunkBase64 });
        writtenBytes += chunk.size;
      }
    };

    if (typeof produceArchive === "function") {
      const reportedSize = await produceArchive(append, maxArchiveBytes);
      if (
        reportedSize != null &&
        (!Number.isSafeInteger(reportedSize) || reportedSize !== writtenBytes)
      ) {
        throw syncError("ARCHIVE_SIZE_MISMATCH");
      }
    } else {
      await append(archive);
    }

    if (writtenBytes <= 0) throw syncError("ARCHIVE_EMPTY");
    return token;
  } catch (error) {
    await LocalSync.discardArchive({ token }).catch(() => {});
    throw error;
  }
}

async function archiveResultToFile(result, fileName = "local-sync.zip") {
  const { uri, archiveToken, size } = result ?? {};
  try {
    const reportedSize = Number(size);
    if (!Number.isSafeInteger(reportedSize) || reportedSize <= 0) {
      throw syncError("ARCHIVE_SIZE_INVALID");
    }
    assertImportFileSize({ size: reportedSize });

    if (typeof uri !== "string" || !uri.startsWith("file://")) {
      throw syncError("ARCHIVE_URI_INVALID");
    }
    if (typeof archiveToken !== "string" || archiveToken.length === 0) {
      throw syncError("ARCHIVE_TOKEN_MISSING");
    }

    const localUrl = Capacitor.convertFileSrc(uri);
    const response = await fetch(localUrl);
    if (!response.ok) {
      throw syncError(
        "ARCHIVE_READ_FAILED",
        `Не удалось прочитать полученный архив (${response.status})`,
      );
    }
    const blob = await response.blob();
    assertImportFileSize(blob);
    if (blob.size !== reportedSize) {
      throw syncError("ARCHIVE_SIZE_MISMATCH");
    }
    return new File([blob], fileName, { type: "application/zip" });
  } finally {
    if (typeof archiveToken === "string" && archiveToken) {
      await LocalSync.releaseReceivedArchive({ archiveToken }).catch(() => {});
    }
  }
}

export function isLocalSyncAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export const LOCAL_SYNC_MAX_ARCHIVE_BYTES = IMPORT_LIMITS.maxFileBytes;

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
    throw syncError("QR_NOT_LEAK_TRACKER");
  }

  let payload;
  try {
    payload = JSON.parse(value.slice(QR_PREFIX.length));
  } catch {
    throw syncError("QR_CORRUPT");
  }

  if (payload?.version !== QR_VERSION) {
    throw syncError("QR_INCOMPATIBLE_VERSION");
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
    throw syncError("QR_INVALID_PARAMS");
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
    throw syncError("QR_MISSING_PROJECT_ID");
  }
  if (expectedSyncId) {
    if (payload.syncId !== expectedSyncId) {
      throw syncError("QR_OTHER_DATABASE");
    }
  } else if (expectedProjectKey && payload.projectKey !== expectedProjectKey) {
    throw syncError("QR_OTHER_PROJECT");
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
    throw syncError("QR_SCAN_UNSUPPORTED");
  }

  const { camera } = await BarcodeScanner.requestPermissions();
  assertScanActive();
  if (camera !== "granted" && camera !== "limited") {
    throw syncError("CAMERA_PERMISSION_REQUIRED");
  }

  document.body.classList.add("local-sync-scanner-active");

  return new Promise((resolve, reject) => {
    let barcodeListener;
    let errorListener;
    let finished = false;

    const cleanup = async () => {
      document.body.classList.remove("local-sync-scanner-active");
      activeQrScanCancel = null;
      await barcodeListener?.remove().catch(() => {});
      await errorListener?.remove().catch(() => {});
      await BarcodeScanner.stopScan().catch(() => {});
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
          await nextBarcodeListener.remove().catch(() => {});
          return;
        }
        barcodeListener = nextBarcodeListener;

        const nextErrorListener = await BarcodeScanner.addListener(
          "scanError",
          ({ message }) => void finish(reject, new Error(message)),
        );
        if (finished) {
          await nextErrorListener.remove().catch(() => {});
          return;
        }
        errorListener = nextErrorListener;
        await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
        if (finished) await BarcodeScanner.stopScan().catch(() => {});
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

export async function startLocalSyncHost({
  archive = null,
  produceArchive,
  projectKey,
  syncId,
  allowMultipleImports = false,
  onArchive,
  onError,
  onApprovalRequest,
  onSessionUpdate,
  onSessionEnded,
}) {
  assertNativeAndroid();
  const listeners = [];
  const addListener = async (eventName, callback) => {
    const listener = await LocalSync.addListener(eventName, callback);
    listeners.push(listener);
    return listener;
  };
  const removeListeners = async () => {
    await Promise.all(
      listeners.map((listener) => listener.remove().catch(() => {})),
    );
  };

  try {
    await addListener("archiveReceived", async (archiveResult) => {
      try {
        const file = await archiveResultToFile(archiveResult);
        await onArchive(file);
      } catch (error) {
        onError?.(error);
      }
    });
    await addListener("syncError", ({ message, code }) => {
      onError?.(Object.assign(new Error(message), code ? { code } : {}));
    });
    await addListener("peerApprovalRequested", async (request) => {
      let approved = false;
      try {
        approved = Boolean(await onApprovalRequest?.(request));
      } catch {
        approved = false;
      }
      await LocalSync.resolvePeerApproval({
        requestId: request.requestId,
        approved,
      }).catch(() => {});
    });
    await addListener("hostSessionUpdated", (session) => {
      onSessionUpdate?.(session);
    });
    await addListener("hostSessionEnded", (event) => {
      onSessionEnded?.(event);
    });

    const archiveToken = await prepareNativeArchive({
      archive,
      produceArchive,
    });
    const session = await LocalSync.startHost({
      archiveToken,
      projectKey,
      syncId,
      allowMultipleImports,
      sessionDurationMs: LOCAL_SYNC_SESSION_DURATION_MS,
    });
    return {
      ...session,
      async stop() {
        await LocalSync.stopHost();
        await removeListeners();
      },
    };
  } catch (error) {
    await removeListeners();
    throw error;
  }
}

export async function exchangeLocalSyncArchive({
  host,
  port,
  code,
  fingerprint,
  archive = null,
  produceArchive,
  projectKey,
  syncId,
  sessionId,
}) {
  assertNativeAndroid();
  const archiveToken = await prepareNativeArchive({
    archive,
    produceArchive,
  });
  try {
    const result = await LocalSync.exchange({
      host: host.trim(),
      port: Number(port),
      code: code.trim(),
      fingerprint: fingerprint.replace(/[^0-9a-f]/gi, "").toUpperCase(),
      archiveToken,
      projectKey,
      syncId,
      sessionId: normalizeSessionId(sessionId),
    });
    return archiveResultToFile(result);
  } catch (error) {
    await LocalSync.discardArchive({ token: archiveToken }).catch(() => {});
    throw error;
  }
}

export async function fetchLocalSyncArchive({
  host,
  port,
  code,
  fingerprint,
  projectKey,
  syncId,
  sessionId,
}) {
  assertNativeAndroid();
  const result = await LocalSync.fetchArchive({
    host: host.trim(),
    port: Number(port),
    code: code.trim(),
    fingerprint: fingerprint.replace(/[^0-9a-f]/gi, "").toUpperCase(),
    projectKey,
    syncId,
    sessionId: normalizeSessionId(sessionId),
  });
  return archiveResultToFile(result, "local-sync-import.zip");
}
