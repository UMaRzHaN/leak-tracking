import { appError } from "@/utils/appError";
import { assertNativeAndroid } from "@/services/sync/localSyncPlatform";
import { parseLocalSyncQrPayload } from "@/services/sync/localSyncQrPayload";
import { ignoredError } from "@/utils/ignoredError";

/**
 * Сканирование QR-кода локальной синхронизации.
 *
 * Разбор самого кода живёт в `localSyncQrPayload` и реэкспортируется отсюда:
 * для вызывающей стороны это по-прежнему один модуль «QR», а внутри — чистая
 * функция над строкой отдельно от камеры с её разрешениями и слушателями.
 *
 * Всё вместе стоит в стороне от передачи архива: общего у них только проверка
 * платформы — ни плагина, ни сессии, ни архива.
 */

// Сканер сам зовёт разбор, поэтому имя нужно и локально, и наружу: вызывающая
// сторона по-прежнему видит один модуль «QR».
export {
  buildLocalSyncQrPayload,
  parseLocalSyncQrPayload,
  createLocalSyncQrSvg,
} from "@/services/sync/localSyncQrPayload";

// Уборка после сканирования, которое уже закончилось. Слушатель, отказавшийся
// отцепиться, не должен провалить успешный скан, но оставленный работать
// сканер — то, о чём стоит знать.
const ignoreListener = ignoredError("localSync.removeListener");
const ignoreStopScan = ignoredError("localSync.stopScan");

// Одно сканирование за раз, а поколение — это то, что сообщает начатому до
// отмены скану, что он больше не текущий.
let activeQrScanCancel = null;
let qrScanGeneration = 0;

function cancelledScanError() {
  return appError("QR_SCAN_CANCELLED", "Сканирование отменено");
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
    throw appError(
      "QR_SCAN_UNSUPPORTED",
      "Сканирование QR не поддерживается на этом телефоне",
    );
  }

  const { camera } = await BarcodeScanner.requestPermissions();
  assertScanActive();
  if (camera !== "granted" && camera !== "limited") {
    throw appError(
      "CAMERA_PERMISSION_REQUIRED",
      "Разрешите приложению использовать камеру",
    );
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
