import { buildWorkbookBufferLocally } from "@/pages/DataBase/excel";
import { parseExcelImportFile } from "@/services/import/excelImportParse";

// One worker serves both directions on purpose. Vite gives every worker its
// own module graph, so a second Excel worker would ship a second copy of
// ExcelJS — about 900 kB that no user benefits from.

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

const post = (message, transfer) =>
  /** @type {any} */ (globalThis).postMessage(message, transfer ?? []);

globalThis.onmessage = async (event) => {
  const { kind, payload } = event.data ?? {};
  try {
    if (kind === "import") {
      // Leaks are plain objects and photos are Blobs, so the result clones
      // as-is; Blobs are cloned by reference, not copied.
      const result = await parseExcelImportFile(payload?.file, {
        ...(payload?.options ?? {}),
      });
      post({ ok: true, result });
      return;
    }

    if (kind === "export") {
      const buffer = toTransferableArrayBuffer(
        await buildWorkbookBufferLocally(payload),
      );
      post({ ok: true, buffer }, [buffer]);
      return;
    }

    throw new Error(`Unknown Excel worker request: ${String(kind)}`);
  } catch (error) {
    post({ ok: false, error: String(error?.message ?? error) });
  }
};
