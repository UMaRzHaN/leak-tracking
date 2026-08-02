import { buildWorkbookBufferLocally } from "./excel";

function toTransferableArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      /** @type {ArrayBuffer} */ (value.buffer),
      value.byteOffset,
      value.byteLength,
    ).slice().buffer;
  }
  throw new Error("ExcelJS returned an unsupported buffer type");
}

globalThis.onmessage = async (event) => {
  try {
    const output = await buildWorkbookBufferLocally(event.data);
    const buffer = toTransferableArrayBuffer(output);
    /** @type {any} */ (globalThis).postMessage({ ok: true, buffer }, [buffer]);
  } catch (error) {
    /** @type {any} */ (globalThis).postMessage({
      ok: false,
      error: String(error?.message ?? error),
    });
  }
};
