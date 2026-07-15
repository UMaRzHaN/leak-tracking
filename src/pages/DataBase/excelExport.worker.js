import { buildWorkbookBufferLocally } from "./excel";

function toTransferableArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  throw new Error("ExcelJS returned an unsupported buffer type");
}

globalThis.onmessage = async (event) => {
  try {
    const output = await buildWorkbookBufferLocally(event.data);
    const buffer = toTransferableArrayBuffer(output);
    globalThis.postMessage({ ok: true, buffer }, [buffer]);
  } catch (error) {
    globalThis.postMessage({
      ok: false,
      error: String(error?.message ?? error),
    });
  }
};
