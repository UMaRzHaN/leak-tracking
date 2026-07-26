import { registerPlugin } from "@capacitor/core";

const PublicFileWriter = registerPlugin("PublicFileWriter");
const EXPORT_CHUNK_BYTES = 512 * 1024;

function blobChunkToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Export read failed"));
    reader.readAsDataURL(blob);
  });
}

function toBlob(value) {
  if (value instanceof Blob) return value;
  if (value instanceof Uint8Array) {
    return new Blob([
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    ]);
  }
  if (value instanceof ArrayBuffer) return new Blob([value]);
  throw new TypeError("Export chunk must be a Blob, Uint8Array or ArrayBuffer");
}

export async function writePublicFileStream({
  folder,
  fileName,
  mimeType = "application/octet-stream",
  produce,
}) {
  if (typeof produce !== "function") {
    throw new TypeError("produce must be a function");
  }

  const { token, maxExportBytes } = await PublicFileWriter.prepare();
  let expectedSize = 0;
  try {
    const append = async (value) => {
      const blob = toBlob(value);
      for (let offset = 0; offset < blob.size; offset += EXPORT_CHUNK_BYTES) {
        const chunk = blob.slice(offset, offset + EXPORT_CHUNK_BYTES);
        if (expectedSize + chunk.size > maxExportBytes) {
          throw new Error(
            `Export file is larger than ${Math.floor(maxExportBytes / 1024 / 1024)} MB`,
          );
        }
        const chunkBase64 = await blobChunkToBase64(chunk);
        await PublicFileWriter.appendChunk({ token, chunkBase64 });
        expectedSize += chunk.size;
      }
    };

    await produce(append);
    return await PublicFileWriter.commit({
      token,
      expectedSize,
      folder,
      fileName,
      mimeType,
    });
  } catch (error) {
    await PublicFileWriter.discard({ token }).catch(() => {});
    throw error;
  }
}

export function writePublicFile({ folder, fileName, blob, mimeType }) {
  return writePublicFileStream({
    folder,
    fileName,
    mimeType: mimeType || blob.type || "application/octet-stream",
    produce: (append) => append(blob),
  });
}
