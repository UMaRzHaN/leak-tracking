import { fingerprintBlob } from "@/utils/blobHash";

/**
 * Data-URI обратно в Blob.
 *
 * Своя копия, а не общая из utils/photoConversion: ввоз получает строку из
 * чужой книги и обязан отвечать `null` на всё, что не «data:...;base64,», не
 * бросая. Общая ведёт себя так же, но её договор шире, и держать здесь
 * узкий — дешевле, чем следить за чужим.
 */
export async function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
}

/**
 * Запись снимков ввоза на устройство и откат, если ввоз не удался.
 *
 * Отделено от сверки: та решает, тот же это снимок или другой, и ничего не
 * пишет; здесь наоборот — только запись и уборка за собой. Разделение важно
 * тем, что откат обязан снести ровно то, что записал этот заход, и ничего
 * сверх того.
 */
export async function getPhotoFingerprint(blob, fingerprintCache) {
  if (!fingerprintCache.has(blob)) {
    fingerprintCache.set(blob, fingerprintBlob(blob));
  }
  return fingerprintCache.get(blob);
}
