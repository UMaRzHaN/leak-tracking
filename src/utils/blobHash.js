function readBlobBytes(blob) {
  if (!(blob instanceof Blob)) {
    throw new TypeError("Expected a Blob");
  }
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read blob"));
    reader.readAsArrayBuffer(blob);
  });
}

function fallbackHash(bytes) {
  // Two independent 32-bit streams plus the byte length. This fallback is only
  // used on old WebViews without SubtleCrypto; modern Android uses SHA-256.
  let first = 2166136261;
  let second = 2246822519;
  for (const value of bytes) {
    first = Math.imul(first ^ value, 16777619);
    second = Math.imul(second ^ value, 3266489917);
  }
  return `${bytes.length.toString(16).padStart(8, "0")}${(first >>> 0)
    .toString(16)
    .padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export async function fingerprintBlob(blob) {
  const buffer = await readBlobBytes(blob);
  const bytes = new Uint8Array(buffer);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }
  return fallbackHash(bytes);
}
