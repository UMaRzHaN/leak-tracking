import { fingerprintBlob } from "@/utils/blobHash";
import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";

/**
 * Починка записей, у которых в поле снимка лежит не путь.
 *
 * Импорт Excel до исправления оставлял у событий сам Blob: запись сохранялась
 * с ним, и в IndexedDB он живёт до сих пор — вместе со снимком. На телефоне
 * Blob при записи в JSON стал `{}`, и снимка там уже нет. Первое чинится:
 * снимок кладётся в хранилище фото, а в запись встаёт путь. Второе только
 * убирается — запись должна честно говорить «фото нет», а не ронять тех, кто
 * ждёт строку.
 */

const LEAK_FIELD_SUFFIX = {
  photo: "",
  photo_after: "_after",
  photo_repair: "_repair",
};

// Ключи хранилища те же, что у импорта и восстановления архива.
const NESTED_RECORDS = /** @type {[string, string, readonly string[]][]} */ ([
  ["monitoringRecords", "monitoring", MONITORING_PHOTO_FIELDS],
  ["events", "event", EVENT_PHOTO_FIELDS],
]);

function isCorrupted(value) {
  return value != null && typeof value !== "string";
}

function isLeak(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Все поля снимков записи: сама утечка, записи обхода, лента. */
function* photoSlots(leak) {
  const baseKey = String(leak.leak_id ?? leak.id);
  for (const field of LEAK_PHOTO_FIELDS) {
    const suffix = LEAK_FIELD_SUFFIX[field] ?? `_${field}`;
    yield { holder: leak, field, storageKey: `${baseKey}${suffix}` };
  }
  for (const [key, kind, fields] of NESTED_RECORDS) {
    const records = Array.isArray(leak[key]) ? leak[key] : [];
    for (const [index, record] of records.entries()) {
      for (const field of fields) {
        const suffix = field === "photo" ? "" : `_${field}`;
        yield {
          holder: record,
          field,
          storageKey: `${baseKey}_${kind}_${record?.id ?? index + 1}${suffix}`,
        };
      }
    }
  }
}

/** @param {any[]} leaks */
export function hasCorruptedPhotoValues(leaks) {
  return (Array.isArray(leaks) ? leaks : []).some(
    (leak) =>
      isLeak(leak) &&
      [...photoSlots(leak)].some(({ holder, field }) =>
        isCorrupted(holder?.[field]),
      ),
  );
}

/**
 * Кладёт каждый Blob в хранилище фото — один раз, даже если он стоит в
 * нескольких полях. Не сохранившийся снимок в ответ не попадает и останется в
 * записи как был: терять его незачем.
 *
 * @param {any[]} leaks
 * @param {(blob: Blob, storageKey: string, options: {contentHash: string}) => Promise<unknown>} savePhoto
 *   путь строкой; всё прочее считается несохранённым снимком
 * @returns {Promise<Map<Blob, string>>}
 */
export async function saveCorruptedPhotoBlobs(leaks, savePhoto) {
  const pathByBlob = new Map();
  for (const leak of Array.isArray(leaks) ? leaks : []) {
    if (!isLeak(leak)) continue;
    for (const { holder, field, storageKey } of photoSlots(leak)) {
      const value = holder?.[field];
      if (!(value instanceof Blob) || pathByBlob.has(value)) continue;
      const path = await savePhoto(value, storageKey, {
        contentHash: await fingerprintBlob(value),
      });
      if (typeof path === "string" && path) pathByBlob.set(value, path);
    }
  }
  return pathByBlob;
}

/**
 * Применяет починку к текущим записям, а не к тем, с которых сохраняли
 * снимки: пока они сохранялись, запись могли поправить. Blob меняется на путь,
 * только если в поле всё ещё он же; прочий мусор убирается. Нетронутые записи
 * возвращаются теми же объектами.
 *
 * @param {any[]} leaks
 * @param {Map<Blob, string>} pathByBlob
 * @returns {{leaks: any[], repaired: number, remaining: number}}
 */
export function applyPhotoRepairs(leaks, pathByBlob) {
  let repaired = 0;
  let remaining = 0;

  const repairHolder = (holder, fields) => {
    let copy = holder;
    for (const field of fields) {
      const value = holder?.[field];
      if (!isCorrupted(value)) continue;
      const path = value instanceof Blob ? pathByBlob.get(value) : undefined;
      if (value instanceof Blob && !path) {
        remaining += 1;
        continue;
      }
      if (copy === holder) copy = { ...holder };
      if (path) copy[field] = path;
      else delete copy[field];
      repaired += 1;
    }
    return copy;
  };

  const next = (Array.isArray(leaks) ? leaks : []).map((leak) => {
    if (!isLeak(leak)) return leak;
    let copy = repairHolder(leak, LEAK_PHOTO_FIELDS);
    for (const [key, , fields] of NESTED_RECORDS) {
      if (!Array.isArray(leak[key])) continue;
      const records = leak[key].map((record) => repairHolder(record, fields));
      if (records.every((record, index) => record === leak[key][index])) {
        continue;
      }
      if (copy === leak) copy = { ...leak };
      copy[key] = records;
    }
    return copy;
  });

  return { leaks: next, repaired, remaining };
}
