import { getRepairDonePhoto, getRepairPhoto } from "@/domain/leakEvents";

/**
 * Опознаватели снимков и ключи, под которыми они лежат в карте книги.
 *
 * Опознаватель отвечает на вопрос «тот же это снимок или другой» при повторной
 * выгрузке: он выводится из записи, а не из её места в списке, — иначе
 * отфильтрованная выгрузка меняла бы имена файлов всем, кто сдвинулся.
 * Ключ карты, наоборот, выводится из места: по нему лист книги находит снимок,
 * и лист знает про строку, а не про идентификатор записи.
 */

/**
 * Утечка без своего `id` опознаётся биркой, а без бирки — местом в списке.
 * Порядок именно такой: `id` переживает переименование бирки, бирка —
 * пересортировку, а место не переживает ничего и остаётся последним доводом.
 */
function leakIdentity(leak, leakIndex) {
  return leak?.id != null && String(leak.id).trim()
    ? `id:${String(leak.id)}`
    : `tag:${String(leak?.leak_id ?? "").trim() || `index:${leakIndex}`}`;
}

function nestedIdentity(record, recordIndex) {
  return record?.id != null && String(record.id).trim()
    ? `id:${String(record.id)}`
    : `index:${recordIndex}`;
}

/** Снимок «photo» — сам предмет записи, и поле в опознавателе ему не нужно. */
function withPhotoField(baseIdentity, photoKey) {
  return photoKey === "photo"
    ? baseIdentity
    : `${baseIdentity}:field:${photoKey}`;
}

export function getLeakPhotoIdentity(leak, leakIndex, photoKey) {
  return `${leakIdentity(leak, leakIndex)}:field:${photoKey}`;
}

export function getMonitoringPhotoIdentity(
  leak,
  leakIndex,
  record,
  recordIndex,
  photoKey,
) {
  const base = `${leakIdentity(leak, leakIndex)}:monitoring:${nestedIdentity(
    record,
    recordIndex,
  )}`;
  return withPhotoField(base, photoKey);
}

export function getEventPhotoIdentity(
  leak,
  leakIndex,
  event,
  eventIndex,
  photoKey,
) {
  const base = `${leakIdentity(leak, leakIndex)}:event:${nestedIdentity(
    event,
    eventIndex,
  )}`;
  return withPhotoField(base, photoKey);
}

export function getMonitoringPhotoMapKey(leakIndex, recordIndex, photoKey) {
  const baseKey = `monitoring:${leakIndex}:${recordIndex}`;
  return photoKey === "photo" ? baseKey : `${baseKey}:${photoKey}`;
}

export function getEventPhotoMapKey(leakIndex, eventIndex, photoKey) {
  const baseKey = `event:${leakIndex}:${eventIndex}`;
  return photoKey === "photo" ? baseKey : `${baseKey}:${photoKey}`;
}

/**
 * Путь снимка утечки для колонки книги.
 *
 * Поля `photo_repair` и `photo_after` перестали писаться: починка живёт в
 * ленте. Колонки «Фото в ремонте» и «Фото после ремонта» остаются, и путь для
 * них спрашивается там же, где его теперь спрашивает карточка, — иначе книга
 * обещала бы снимок и отправляла к файлу, которого в ней нет.
 */
export function getLeakPhotoPath(leak, key) {
  if (key === "photo_repair") return getRepairPhoto(leak);
  if (key === "photo_after") return getRepairDonePhoto(leak);
  return leak?.[key] ?? null;
}
