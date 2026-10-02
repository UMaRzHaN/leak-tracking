import { fingerprintBlob } from "@/utils/blobHash";

// Где снимка нет, Esri отвечает кодом 200 и картинкой «Map data not yet
// available» — всегда одним и тем же JPEG. Она выглядит как тайл, оседала в
// кэше и при приближении покрывала поле надписями. Параметр blankTile=false
// превращает её в 404, но без CORS-заголовков: WebView видит такой ответ как
// обрыв сети. Поэтому узнаём заглушку по содержимому — по размеру, а хеш
// считаем только при совпадении размера, чтобы не платить за каждый тайл.
// Без WebCrypto отпечаток не совпадёт, и тайл останется: лучше показать
// заглушку, чем выбросить настоящий снимок того же размера.
const PLACEHOLDER_SIZE = 2521;
const PLACEHOLDER_SHA256 =
  "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";

/** @param {Blob} blob */
export async function isPlaceholderTile(blob) {
  if (blob?.size !== PLACEHOLDER_SIZE) return false;
  try {
    return (await fingerprintBlob(blob)) === PLACEHOLDER_SHA256;
  } catch {
    return false;
  }
}
