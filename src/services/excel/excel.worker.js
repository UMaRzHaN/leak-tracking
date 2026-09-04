import { buildWorkbookBufferLocally } from "@/services/excelExport/buildWorkbookBuffer";
import { parseExcelImportFile } from "@/services/import/excelImportParse";
import { parseBackupZip } from "@/services/backup/archiveParser";
import {
  readInventoryArchiveCards,
  readInventorySheetFile,
} from "@/services/inventory/inventoryWorkbookParse";
import { buildInventoryWorkbookBuffer } from "@/services/inventory/inventoryWorkbookBuild";
import { globalScope } from "@/utils/globalScope";

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
  /** @type {any} */ (globalScope).postMessage(message, transfer ?? []);

// A request that fails to deserialize would otherwise get no reply at all,
// leaving the client pending until its timeout. The payload was never read, so
// the main thread can still do the work itself.
globalScope.onmessageerror = () => {
  post({
    ok: false,
    unavailable: true,
    error: "Excel worker could not read the request",
  });
};

// A backup archive stays open here for the length of the import: its photos
// are read one at a time as the main thread saves them, so peak memory stays
// what it was before the parse moved off the main thread. Handing the whole
// set back at once would have meant holding a 190 MB archive in memory.
let backupArchive = /** @type {any} */ (null);

globalScope.onmessage = async (event) => {
  const { kind, op, id, payload } = event.data ?? {};
  try {
    if (kind === "backup") {
      if (op === "open") {
        const { photos, ...data } = await parseBackupZip(payload?.file);
        backupArchive = photos;
        post({
          ok: true,
          id,
          result: { ...data, sizes: photos.declaredSizes() },
        });
        return;
      }

      if (op === "readPhoto") {
        if (!backupArchive) throw new Error("Backup archive is not open");
        const blob = await backupArchive.read(payload?.path);
        post({ ok: true, id, blob });
        return;
      }

      throw new Error(`Unknown backup worker request: ${String(op)}`);
    }

    if (kind === "import") {
      // Leaks are plain objects and photos are Blobs, so the result clones
      // as-is; Blobs are cloned by reference, not copied.
      const result = await parseExcelImportFile(payload?.file, {
        ...(payload?.options ?? {}),
      });
      post({ ok: true, result });
      return;
    }

    // Реестр ходит сюда по той же причине, что и утечки: у главного потока
    // иначе оказывается своя копия ExcelJS, вторая в сборке. Круговой рейс
    // ради одной таблицы дороже прямого вызова, но лишние 900 кБ в графе
    // приложения дороже рейса.
    if (kind === "inventory") {
      if (op === "sheet") {
        const result = await readInventorySheetFile(
          payload?.file,
          payload?.excel,
        );
        post({ ok: true, id, result });
        return;
      }

      if (op === "cards") {
        // `null` — служебного листа в архиве нет; отличить его от пустого
        // разбора вызывающему нужно, поэтому едет как есть.
        const cards = await readInventoryArchiveCards(
          payload?.file,
          payload?.excel,
        );
        post({ ok: true, id, result: { cards } });
        return;
      }

      if (op === "workbook") {
        const buffer = toTransferableArrayBuffer(
          await buildInventoryWorkbookBuffer(
            payload?.sheetSpec,
            payload?.options ?? {},
          ),
        );
        post({ ok: true, id, buffer }, [buffer]);
        return;
      }

      throw new Error(`Unknown inventory worker request: ${String(op)}`);
    }

    if (kind === "export") {
      const buffer = toTransferableArrayBuffer(
        await buildWorkbookBufferLocally(payload),
      );
      post({ ok: true, buffer }, [buffer]);
      return;
    }

    throw new Error(`Unknown Excel worker request: ${String(kind)}`);
  } catch (/** @type {any} */ error) {
    post({ ok: false, id, error: String(error?.message ?? error) });
  }
};
