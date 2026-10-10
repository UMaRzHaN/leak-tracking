import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";
import { idb } from "./idb";

/**
 * Два вопроса, которые уборка снимков задаёт перед удалением: ссылается ли на
 * файл хоть одна запись и не слишком ли он свеж, чтобы считать его сиротой.
 *
 * Второй вопрос нужен потому, что снимок пишется раньше записи, которая на
 * него сошлётся: форма сохраняет файл, потом карточку. Уборка, составившая
 * список между этими шагами, видит файл без ссылки — и без срока удалила бы
 * снимок, который вот-вот станет живым.
 */

export function collectReferencedPhotos(leaks = []) {
  const referenced = new Set();
  for (const leak of leaks) {
    for (const field of LEAK_PHOTO_FIELDS) {
      if (leak[field]) referenced.add(leak[field]);
    }

    if (Array.isArray(leak.monitoringRecords)) {
      for (const record of leak.monitoringRecords) {
        for (const field of MONITORING_PHOTO_FIELDS) {
          if (record?.[field]) referenced.add(record[field]);
        }
      }
    }

    // Лента событий обходится наравне со списком обходов, а не вместо него.
    // Пока обе формы живут рядом, снимок может числиться только в одной из
    // них, и пропуск любой означает удаление живого фото как бесхозного.
    if (Array.isArray(leak.events)) {
      for (const event of leak.events) {
        for (const field of EVENT_PHOTO_FIELDS) {
          if (event?.[field]) referenced.add(event[field]);
        }
      }
    }
  }
  return referenced;
}

/**
 * Возраст, который не удалось узнать, — не повод удалять: при заданном сроке
 * такой снимок остаётся до уборки, которая срока не ставит.
 */
export function isOldEnough(savedAt, minAgeMs, now) {
  const time = Number(savedAt);
  if (!Number.isFinite(time) || time <= 0) return false;
  return now - time >= minAgeMs;
}

/**
 * Когда каждый снимок в базе браузера был сохранён: ключ → `timestamp` записи.
 * Значения идут курсором, но снимок в них — ссылка на Blob, а не его байты.
 *
 * @returns {Promise<Map<IDBValidKey, number>>}
 */
export function listWebPhotoSavedAt() {
  const { db, ready } = idb.getState();
  if (!ready || !db) {
    const error = new Error("IndexedDB store is not ready");
    error.code = "IDB_NOT_READY";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const savedAt = new Map();
    const tx = db.transaction("photos", "readonly");
    const request = tx.objectStore("photos").openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const timestamp = Number(cursor.value?.timestamp);
      savedAt.set(cursor.key, Number.isFinite(timestamp) ? timestamp : 0);
      cursor.continue();
    };
    tx.oncomplete = () => resolve(savedAt);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB listing aborted"));
  });
}
