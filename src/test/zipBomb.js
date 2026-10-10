import JSZip from "jszip";
import { globalScope } from "@/utils/globalScope";

const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const CENTRAL_FILE_HEADER_BYTES = 46;
// Больше лимита на одну запись (256 МБ), но ещё в 32 битах — без ZIP64.
const BOMB_SIZE = 0xfffffff0;

/**
 * Архив, чьи записи `bombs` объявляют распакованный размер почти в 4 ГБ.
 *
 * Настоящая бомба весит сотни килобайт и раздувается в гигабайты — собирать её
 * в тесте значит гонять те же гигабайты через память. Объявленный размер
 * проверяется до распаковки тем же `assertArchiveLimits`, так что поддельный
 * заголовок доказывает главное: чтение идёт через лимиты, а не мимо них.
 *
 * @param {Record<string, string|Uint8Array|ArrayBuffer>} files
 * @param {string[]} bombs имена записей, которые надо «раздуть»
 * @param {string} [name]
 */
export async function inflatedArchive(files, bombs, name = "bomb.zip") {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new globalScope.TextDecoder();

  for (let offset = 0; offset + CENTRAL_FILE_HEADER_BYTES <= bytes.length;) {
    if (view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) {
      offset += 1;
      continue;
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const start = offset + CENTRAL_FILE_HEADER_BYTES;
    const entryName = decoder.decode(bytes.subarray(start, start + nameLength));
    if (bombs.includes(entryName)) {
      view.setUint32(offset + 24, BOMB_SIZE, true);
    }
    offset = start + nameLength + extraLength + commentLength;
  }

  return new File([buffer], name, { type: "application/zip" });
}
