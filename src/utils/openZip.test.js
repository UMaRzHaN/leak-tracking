import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_LIMITS } from "./importLimits";
import { openZip } from "./openZip";

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: vi.fn(async () => []), save: vi.fn() },
}));
vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: {
    addSchema: vi.fn(),
    listSchemas: vi.fn(async () => []),
    readIndex: vi.fn(async () => []),
    removeSchema: vi.fn(),
    saveIndex: vi.fn(),
  },
}));

/**
 * Архив, чей конец честно говорит «одна запись», а центральный каталог несёт
 * на одну больше предела. Такой файл весит пару мегабайт и раскрывается JSZip
 * в десятки тысяч объектов — ровно то, что предпроверка должна остановить до
 * разбора.
 */
function entryCountBomb() {
  const entryCount = IMPORT_LIMITS.maxArchiveEntries + 1;
  const centralSize = entryCount * 46;
  const bytes = new Uint8Array(centralSize + 22);
  const view = new DataView(bytes.buffer);
  for (let offset = 0; offset < centralSize; offset += 46) {
    view.setUint32(offset, 0x02014b50, true);
  }
  view.setUint32(centralSize, 0x06054b50, true);
  view.setUint16(centralSize + 8, 1, true);
  view.setUint16(centralSize + 10, 1, true);
  view.setUint32(centralSize + 12, centralSize, true);
  view.setUint32(centralSize + 16, 0, true);
  return bytes;
}

let loadSpy;
beforeEach(() => {
  loadSpy = vi.spyOn(JSZip.prototype, "loadAsync");
});
afterEach(() => {
  loadSpy.mockRestore();
});

describe("openZip", () => {
  it("отсекает архив с лишними записями до разбора", async () => {
    const bomb = new Blob([entryCountBomb()]);
    await expect(openZip(bomb)).rejects.toThrow("too many entries");
    await expect(openZip(entryCountBomb())).rejects.toThrow("too many entries");
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("открывает обычный архив — из Blob и из байтов", async () => {
    const source = new JSZip();
    source.file("a.txt", "hello");
    const blob = await source.generateAsync({ type: "blob" });

    const fromBlob = await openZip(blob, { asArrayBuffer: true });
    expect(await fromBlob.file("a.txt").async("string")).toBe("hello");
    const fromBytes = await openZip(await blob.arrayBuffer());
    expect(Object.keys(fromBytes.files)).toEqual(["a.txt"]);
  });

  it("не-архив по желанию вызывающего — null, а не ошибка", async () => {
    const text = new Blob(["просто текст"]);
    await expect(openZip(text, { nullIfNotZip: true })).resolves.toBeNull();
    await expect(openZip(text)).rejects.toThrow();
  });
});

describe("входы импорта не разбирают бомбу", () => {
  const project = { id: "p1", folderName: "buzahur" };

  it("распознавание формата отказывает, а не называет файл непонятным", async () => {
    const { detectImportKind } =
      await import("@/services/import/importRouting");
    await expect(
      detectImportKind(new Blob([entryCountBomb()])),
    ).rejects.toThrow("too many entries");
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("реестр и чертежи из архива", async () => {
    const { previewArchiveComponents, restoreComponentsFromArchive } =
      await import("@/services/backup/componentArchive");
    const { restoreSchemasFromArchive } =
      await import("@/services/backup/schemaArchive");
    const bomb = new Blob([entryCountBomb()]);

    await expect(previewArchiveComponents(bomb, project)).resolves.toBeNull();
    await expect(restoreComponentsFromArchive(bomb, project)).resolves.toEqual({
      added: 0,
      updated: 0,
      removed: 0,
      conflicts: 0,
    });
    await expect(restoreSchemasFromArchive(bomb, project)).resolves.toEqual({
      restored: 0,
      skipped: 0,
    });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("книга инвентаризации", async () => {
    const { readInventoryArchiveCards } =
      await import("@/services/inventory/inventoryWorkbookParse");
    const bomb = new File([entryCountBomb()], "inventory.zip", {
      type: "application/zip",
    });
    await expect(readInventoryArchiveCards(bomb, null)).resolves.toBeNull();
    expect(loadSpy).not.toHaveBeenCalled();
  });
});
