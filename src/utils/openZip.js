import { assertArchiveLimits, preflightZipFile } from "@/utils/importLimits";

const getJSZip = () => import("jszip");

/**
 * Единственная дверь, через которую импорт открывает чужой ZIP.
 *
 * `assertArchiveLimits` после `loadAsync` опаздывает: JSZip к тому моменту уже
 * построил по объекту на каждую запись центрального каталога, и архив с
 * миллионом пустых записей роняет WebView раньше, чем до проверки доходит
 * дело. Предпроверка читает только хвост файла и каталог — поэтому она идёт
 * первой, а проверка после разбора остаётся вторым рубежом.
 *
 * Пока предпроверку вызывал только разбор бэкапа и Excel, все остальные входы
 * — распознавание формата, реестр и чертежи из архива, инвентаризация —
 * открывали тот же файл без неё.
 *
 * @param {Blob|ArrayBuffer|Uint8Array} source
 * @param {{asArrayBuffer?: boolean, nullIfNotZip?: boolean}} [options]
 *   asArrayBuffer — отдать JSZip байты, а не Blob (так читали прежние места);
 *   nullIfNotZip — вернуть null, если JSZip файл не разобрал. Лимиты при этом
 *   всё равно бросают: бомба — не «просто не архив».
 * @returns {Promise<any>} открытый JSZip
 */
export async function openZip(source, options = {}) {
  await preflightZipFile(asPreflightSource(source));
  // Загрузчик — вне try: не загрузившийся jszip это отказ инструмента, а не
  // приговор файлу.
  const JSZip = (await getJSZip()).default;

  let zip;
  try {
    const data =
      options.asArrayBuffer && isBlobLike(source)
        ? await /** @type {Blob} */ (source).arrayBuffer()
        : source;
    zip = await new JSZip().loadAsync(data);
  } catch (error) {
    if (options.nullIfNotZip) return null;
    throw error;
  }
  assertArchiveLimits(zip);
  return zip;
}

function isBlobLike(value) {
  return typeof value?.arrayBuffer === "function";
}

/** Байты в памяти предпроверке подаются как файл: ей нужны size и чтение. */
function asPreflightSource(source) {
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
    return {
      size: source.byteLength,
      arrayBuffer: async () => source,
    };
  }
  return source;
}
