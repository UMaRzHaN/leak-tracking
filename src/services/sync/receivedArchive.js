import { appError } from "@/utils/appError";
import { Capacitor } from "@capacitor/core";
import { LocalSync } from "@/services/sync/localSyncPlugin";
import { assertImportFileSize } from "@/utils/importLimits";
import { ignoredError } from "@/utils/ignoredError";

const ignoreRelease = ignoredError("localSync.releaseArchive");

/**
 * Принятый архив — файлом, который умеет читать импорт.
 *
 * Нативная часть отдаёт путь во временный файл, а не байты: WebView читает его
 * напрямую по локальному адресу, без base64 и без моста. Токен освобождается в
 * любом случае — временный файл, оставшийся после неудачного чтения, занимает
 * место до перезапуска.
 */
export async function archiveResultToFile(result, fileName = "local-sync.zip") {
  const { uri, archiveToken, size } = result ?? {};
  try {
    const reportedSize = Number(size);
    if (!Number.isSafeInteger(reportedSize) || reportedSize <= 0) {
      throw appError(
        "RECEIVED_ARCHIVE_BAD_SIZE",
        "Получен некорректный размер архива",
      );
    }
    assertImportFileSize({ size: reportedSize });

    if (typeof uri !== "string" || !uri.startsWith("file://")) {
      throw appError(
        "RECEIVED_ARCHIVE_BAD_PATH",
        "Получен некорректный путь к архиву",
      );
    }
    if (typeof archiveToken !== "string" || archiveToken.length === 0) {
      throw appError(
        "RECEIVED_ARCHIVE_NO_TOKEN",
        "Получен архив без токена очистки",
      );
    }

    const localUrl = Capacitor.convertFileSrc(uri);
    const response = await fetch(localUrl);
    if (!response.ok) {
      throw appError(
        "RECEIVED_ARCHIVE_READ_FAILED",
        `Не удалось прочитать полученный архив (${response.status})`,
      );
    }
    const blob = await response.blob();
    assertImportFileSize(blob);
    if (blob.size !== reportedSize) {
      throw appError(
        "RECEIVED_ARCHIVE_SIZE_MISMATCH",
        "Размер полученного архива не совпадает с заявленным",
      );
    }
    return new File([blob], fileName, { type: "application/zip" });
  } finally {
    if (typeof archiveToken === "string" && archiveToken) {
      await LocalSync.releaseReceivedArchive({ archiveToken }).catch(
        ignoreRelease,
      );
    }
  }
}
