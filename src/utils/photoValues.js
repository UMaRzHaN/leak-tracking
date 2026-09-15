import { blobToDataUri } from "@/utils/photoConversion";
import {
  EVENT_PHOTO_FIELDS,
  LEAK_PHOTO_FIELDS,
  MONITORING_PHOTO_FIELDS,
} from "@/utils/photoFields";

/**
 * Снимок в поле записи — путь строкой, всё прочее — порча.
 *
 * Такая порча бывает: импорт Excel оставлял у событий сам Blob вместо пути, а
 * на телефоне Blob в JSON становится `{}`. Сборщики выгрузок рассчитаны на
 * строку, и порченое значение каждый встречал по-своему: книга Excel падала
 * целиком на `path.startsWith`, а архив приводил Blob к "[object Blob]",
 * терял снимок и склеил бы два разных снимка в один файл.
 *
 * Поэтому значение приводится один раз, на входе выгрузки. Blob — это сам
 * снимок: он становится data URI, который понимают все сборщики, и одинаковые
 * снимки так и остаются одним файлом. Остальное снимком не является и
 * снимается. Записи без порчи возвращаются теми же объектами — копировать всю
 * базу ради редкого случая незачем.
 */

async function portablePhotoValue(value) {
  if (!(value instanceof Blob)) return undefined;
  const dataUri = await blobToDataUri(value);
  return typeof dataUri === "string" && dataUri.startsWith("data:image/")
    ? dataUri
    : undefined;
}

async function withPortableFields(record, fields) {
  let copy = record;
  for (const field of fields) {
    const value = record?.[field];
    if (value == null || typeof value === "string") continue;

    const portable = await portablePhotoValue(value);
    if (copy === record) copy = { ...record };
    if (portable === undefined) delete copy[field];
    else copy[field] = portable;
  }
  return copy;
}

/**
 * @param {any[]} leaks
 * @returns {Promise<any[]>}
 */
export async function withPortablePhotoValues(leaks) {
  if (!Array.isArray(leaks)) return leaks;

  const result = [];
  for (const leak of leaks) {
    if (!leak || typeof leak !== "object" || Array.isArray(leak)) {
      result.push(leak);
      continue;
    }

    let copy = await withPortableFields(leak, LEAK_PHOTO_FIELDS);
    const nestedRecords = /** @type {[string, readonly string[]][]} */ ([
      ["monitoringRecords", MONITORING_PHOTO_FIELDS],
      ["events", EVENT_PHOTO_FIELDS],
    ]);
    for (const [key, fields] of nestedRecords) {
      if (!Array.isArray(leak[key])) continue;
      const records = [];
      for (const record of leak[key]) {
        records.push(await withPortableFields(record, fields));
      }
      if (records.every((record, index) => record === leak[key][index])) {
        continue;
      }
      if (copy === leak) copy = { ...leak };
      copy[key] = records;
    }
    result.push(copy);
  }
  return result;
}
