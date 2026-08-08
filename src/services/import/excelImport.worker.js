import { parseExcelImportFile } from "@/services/import/excelImportParse";

globalThis.onmessage = async (event) => {
  const { file, options } = event.data ?? {};
  try {
    const result = await parseExcelImportFile(file, options ?? {});
    // Photos are Blobs and leaks are plain objects, so the whole result goes
    // through structured clone as-is. Blobs are cloned by reference, so this
    // does not copy the photo bytes back across the boundary.
    globalThis.postMessage({ ok: true, result });
  } catch (error) {
    globalThis.postMessage({
      ok: false,
      error: String(error?.message ?? error),
    });
  }
};
