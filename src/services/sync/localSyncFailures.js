/**
 * Failure codes raised by the web half of local sync, with the Russian text
 * that goes on the error as a fallback.
 *
 * This is the same contract the Android plugin follows: `syncErrors.<code>` is
 * what the UI shows, and the message is what remains readable if a build ever
 * meets a code it cannot translate. `localSyncService.test.js` checks that
 * every code raised there exists in both locales.
 */
const MESSAGES = {
  QR_SCAN_CANCELLED: "Сканирование отменено",
  SYNC_ANDROID_ONLY:
    "Локальная синхронизация доступна только в Android-приложении",
  QR_SESSION_ID_INVALID: "Некорректный идентификатор QR-сеанса",
  QR_NOT_LEAK_TRACKER: "Это не QR-код Leak Tracker",
  QR_CORRUPT: "QR-код синхронизации повреждён",
  QR_INCOMPATIBLE_VERSION: "QR-код создан в несовместимой версии приложения",
  QR_INVALID_PARAMS: "QR-код содержит некорректные параметры подключения",
  QR_MISSING_PROJECT_ID: "QR-код не содержит идентификатор проекта",
  QR_OTHER_DATABASE: "QR-код относится к другой базе данных",
  QR_OTHER_PROJECT: "QR-код создан для другого проекта",
  QR_SCAN_UNSUPPORTED: "Сканирование QR не поддерживается на этом телефоне",
  CAMERA_PERMISSION_REQUIRED: "Разрешите приложению использовать камеру",
  ARCHIVE_READ_FAILED: "Не удалось прочитать архив",
  ARCHIVE_PREPARE_FAILED: "Не удалось подготовить архив",
  ARCHIVE_LIMIT_INVALID: "Native sync returned an invalid archive limit",
  ARCHIVE_EMPTY: "Архив синхронизации пуст",
  ARCHIVE_TOO_LARGE: "Архив синхронизации слишком большой",
  ARCHIVE_SIZE_INVALID: "Получен некорректный размер архива",
  ARCHIVE_SIZE_MISMATCH: "Размер архива не совпадает с заявленным",
  ARCHIVE_URI_INVALID: "Получен некорректный путь к архиву",
  ARCHIVE_TOKEN_MISSING: "Получен архив без токена очистки",
};

/**
 * @param {keyof typeof MESSAGES} code
 * @param {string} [message] overrides the default text where the failure
 * carries a detail worth keeping, such as a size or an HTTP status.
 */
export function syncError(code, message = MESSAGES[code]) {
  const error = new Error(message ?? code);
  error.code = code;
  return error;
}
