import { appError } from "@/utils/appError";

/**
 * «Закончилось место» — отдельный отказ, а не общий сбой записи.
 *
 * Приложение офлайновое и держит фотографии по каждой утечке, каждому обходу и
 * каждой карточке реестра. Кончившееся место — рядовой случай в конце смены, а
 * не теоретический. До сих пор он выглядел так же, как любой другой сбой: на
 * вебе `idb.save` возвращал `false` на любую ошибку, и вызывающая сторона не
 * могла отличить «нет места» от «хранилище сломано»; на Android исключение
 * доезжало текстом от системы.
 *
 * Разница важна тем, что действие пользователя тут совсем другое: не повторить
 * и не звать поддержку, а освободить место — выгрузить проект и почистить
 * кэш карт.
 */

// Веб: DOMException с этим именем; код 22 — его же старое обозначение, которое
// до сих пор встречается в WebView.
const QUOTA_NAMES = new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);

// Android: запись идёт через Filesystem в файл, и наружу выходит текст
// системной ошибки. Русская форма — от локализованной прошивки.
const OUT_OF_SPACE_TEXT =
  /\bENOSPC\b|no space left|not enough space|insufficient (?:free )?space|disk (?:is )?full|storage is full|недостаточно (?:свободного )?места|нет свободного места/i;

/** @param {any} error */
export function isOutOfSpaceError(error) {
  if (!error) return false;
  if (QUOTA_NAMES.has(error.name)) return true;
  // 22 — QUOTA_EXCEEDED_ERR. Проверяется вместе с именем, потому что у
  // DOMException код совпадает с этим значением только для квоты.
  if (error.code === 22 && error instanceof Error) return true;
  return OUT_OF_SPACE_TEXT.test(String(error.message ?? error));
}

/**
 * Переводит отказ по месту в кодированную ошибку, остальные пропускает как
 * есть: подменять чужой сбой своим текстом — потерять причину.
 *
 * @param {any} error
 * @returns {any} та же ошибка либо кодированная
 */
export function asOutOfSpaceError(error) {
  if (!isOutOfSpaceError(error)) return error;
  return appError(
    "DEVICE_OUT_OF_SPACE",
    "На устройстве закончилось место, снимок не сохранён",
  );
}
