import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import {
  NativeLeakStorage,
  isSqlitePluginUnavailable,
} from "@/repositories/nativeSqlitePlugin";

/**
 * Сколько места осталось на устройстве.
 *
 * Два источника, потому что фотографии лежат в разных местах. На Android они
 * идут через Filesystem в приватный каталог приложения, и `storage.estimate()`
 * про него ничего не знает — он отвечает про квоту самого WebView, а это
 * другой том с другим числом. На вебе всё наоборот: файловой системы нет,
 * `estimate()` и есть ответ.
 *
 * До сих пор `estimate()` вызывали и результат выбрасывали: в настройках был
 * виден объём кэша карт и ничего — про место, из которого он берётся.
 */

/**
 * @typedef {{
 *   freeBytes: number | null,
 *   totalBytes: number | null,
 *   usedBytes: number | null,
 * }} DeviceStorage
 */

/** @type {DeviceStorage} */
const UNKNOWN = { freeBytes: null, totalBytes: null, usedBytes: null };

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function readNativeStorage() {
  try {
    const info = await NativeLeakStorage.getStorageInfo();
    const freeBytes = finiteOrNull(info?.freeBytes);
    const totalBytes = finiteOrNull(info?.totalBytes);
    return {
      freeBytes,
      totalBytes,
      usedBytes:
        freeBytes != null && totalBytes != null ? totalBytes - freeBytes : null,
    };
  } catch (error) {
    // Сборка постарше метода не знает — это не отказ, а отсутствие данных.
    if (!isSqlitePluginUnavailable(error)) {
      logger.warn("[deviceStorage] не удалось прочитать объём диска:", error);
    }
    return UNKNOWN;
  }
}

async function readWebStorage() {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) return UNKNOWN;
  try {
    const estimate = await storage.estimate();
    const quota = finiteOrNull(estimate?.quota);
    const usage = finiteOrNull(estimate?.usage);
    return {
      freeBytes: quota != null && usage != null ? quota - usage : null,
      totalBytes: quota,
      usedBytes: usage,
    };
  } catch (error) {
    logger.warn("[deviceStorage] оценка квоты недоступна:", error);
    return UNKNOWN;
  }
}

/** @returns {Promise<DeviceStorage>} */
export function readDeviceStorage() {
  return isNative ? readNativeStorage() : readWebStorage();
}

/**
 * Мегабайты для показа. Гигабайты — от гигабайта и выше: «14 512 МБ» человек
 * не читает, а на телефоне свободного места обычно именно столько.
 *
 * @param {number | null} bytes
 * @returns {{value: string, unit: "MB" | "GB"} | null}
 */
export function formatStorageAmount(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1024) {
    return { value: (megabytes / 1024).toFixed(1), unit: "GB" };
  }
  return { value: String(Math.round(megabytes)), unit: "MB" };
}
