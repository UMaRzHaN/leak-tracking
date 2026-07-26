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

export async function writePublicFile({ folder, fileName, blob, mimeType }) {
  const { token, maxExportBytes } = await PublicFileWriter.prepare();
  try {
    if (blob.size > maxExportBytes) {
      throw new Error(
        `Export file is larger than ${Math.floor(maxExportBytes / 1024 / 1024)} MB`,
      );
    }
    for (let offset = 0; offset < blob.size; offset += EXPORT_CHUNK_BYTES) {
      const chunkBase64 = await blobChunkToBase64(
        blob.slice(offset, offset + EXPORT_CHUNK_BYTES),
      );
      await PublicFileWriter.appendChunk({ token, chunkBase64 });
    }
    return await PublicFileWriter.commit({
      token,
      expectedSize: blob.size,
      folder,
      fileName,
      mimeType: mimeType || blob.type || "application/octet-stream",
    });
  } catch (error) {
    await PublicFileWriter.discard({ token }).catch(() => {});
    throw error;
  }
}
