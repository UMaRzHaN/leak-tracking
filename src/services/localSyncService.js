import { Capacitor, registerPlugin } from "@capacitor/core";

const LocalSync = registerPlugin("LocalSync");
const ARCHIVE_CHUNK_BYTES = 512 * 1024;
const QR_PREFIX = "leak-tracker-sync:";
let activeQrScanCancel = null;
let qrScanGeneration = 0;

function cancelledScanError() {
  const error = new Error("Сканирование отменено");
  error.code = "QR_SCAN_CANCELLED";
  return error;
}

function assertNativeAndroid() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw new Error(
      "Локальная синхронизация доступна только в Android-приложении",
    );
  }
}

function blobChunkToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Не удалось прочитать архив"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const separator = value.indexOf(",");
      if (separator < 0) {
        reject(new Error("Не удалось подготовить архив"));
        return;
      }
      resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function prepareNativeArchive(blob) {
  const { token, maxArchiveBytes } = await LocalSync.prepareArchive();
  if (blob.size > maxArchiveBytes) {
    await LocalSync.discardArchive({ token });
    throw new Error(
      `Архив синхронизации больше ${Math.floor(maxArchiveBytes / 1024 / 1024)} МБ`,
    );
  }

  try {
    for (let offset = 0; offset < blob.size; offset += ARCHIVE_CHUNK_BYTES) {
      const chunk = blob.slice(offset, offset + ARCHIVE_CHUNK_BYTES);
      const chunkBase64 = await blobChunkToBase64(chunk);
      await LocalSync.appendArchiveChunk({ token, chunkBase64 });
    }
    return token;
  } catch (error) {
    await LocalSync.discardArchive({ token }).catch(() => {});
    throw error;
  }
}

async function archiveResultToFile(
  { uri, archiveToken },
  fileName = "local-sync.zip",
) {
  try {
    const localUrl = Capacitor.convertFileSrc(uri);
    const response = await fetch(localUrl);
    if (!response.ok) {
      throw new Error(
        `Не удалось прочитать полученный архив (${response.status})`,
      );
    }
    const blob = await response.blob();
    return new File([blob], fileName, { type: "application/zip" });
  } finally {
    if (archiveToken) {
      await LocalSync.releaseReceivedArchive({ archiveToken }).catch(() => {});
    }
  }
}

export function isLocalSyncAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function buildLocalSyncQrPayload({
  host,
  port,
  code,
  projectKey,
  syncId,
}) {
  return `${QR_PREFIX}${JSON.stringify({
    version: 1,
    host,
    port: Number(port),
    code,
    projectKey,
    syncId,
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

  const validPort =
    Number.isInteger(payload?.port) &&
    payload.port > 0 &&
    payload.port <= 65535;
  const validCode = /^\d{6}$/.test(String(payload?.code ?? ""));
  const validHost =
    typeof payload?.host === "string" && payload.host.trim().length > 0;
  if (payload?.version !== 1 || !validHost || !validPort || !validCode) {
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
    syncId: payload.syncId,
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
      await barcodeListener?.remove().catch(() => {});
      await errorListener?.remove().catch(() => {});
      await BarcodeScanner.stopScan().catch(() => {});
    };
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
        const nextBarcodeListener = await BarcodeScanner.addListener(
          "barcodeScanned",
          (event) => {
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
          },
        );
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
  archive,
  projectKey,
  syncId,
  onArchive,
  onError,
}) {
  assertNativeAndroid();
  const archiveListener = await LocalSync.addListener(
    "archiveReceived",
    async (archiveResult) => {
      try {
        const file = await archiveResultToFile(archiveResult);
        await onArchive(file);
      } catch (error) {
        onError?.(error);
      }
    },
  );
  const errorListener = await LocalSync.addListener(
    "syncError",
    ({ message }) => {
      onError?.(new Error(message));
    },
  );

  try {
    const archiveToken = await prepareNativeArchive(archive);
    const session = await LocalSync.startHost({
      archiveToken,
      projectKey,
      syncId,
    });
    return {
      ...session,
      async stop() {
        await LocalSync.stopHost();
        await archiveListener.remove();
        await errorListener.remove();
      },
    };
  } catch (error) {
    await archiveListener.remove();
    await errorListener.remove();
    throw error;
  }
}

export async function exchangeLocalSyncArchive({
  host,
  port,
  code,
  archive,
  projectKey,
  syncId,
}) {
  assertNativeAndroid();
  const archiveToken = await prepareNativeArchive(archive);
  const result = await LocalSync.exchange({
    host: host.trim(),
    port: Number(port),
    code: code.trim(),
    archiveToken,
    projectKey,
    syncId,
  });
  return archiveResultToFile(result);
}
