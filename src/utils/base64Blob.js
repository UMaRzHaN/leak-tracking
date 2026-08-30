import { globalScope } from "@/utils/globalScope";

/**
 * Перевод между Blob и base64.
 *
 * Мост Capacitor возит строки: файловая система принимает и отдаёт base64, а
 * браузер и то и другое знает как Blob. Вынесено из `SchemaRepository`, где
 * лежало: к хранению чертежей это отношения не имеет, а нужно везде, где файл
 * идёт через мост.
 */

/** Capacitor's Filesystem takes base64; the browser hands us a Blob. */
export async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked because a 25 MB drawing spread over one apply() call overflows the
  // argument limit on every engine that has one.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalScope.btoa(binary);
}

export function base64ToBlob(base64, type) {
  const binary = globalScope.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}
