import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

// Воркера в jsdom нет — книгу собирает тот же чистый сборщик, что грузит он.
vi.mock("@/services/excel/excelWorkerClient", async () => {
  const build = await import("@/services/inventory/inventoryWorkbookBuild");
  return {
    buildInventoryWorkbookBufferInWorker: build.buildInventoryWorkbookBuffer,
  };
});

const { addInventoryFiles } = await import("./inventoryArchive");
const { extractBundledInventory } = await import("./bundledInventory");
const { readInventoryArchiveCards } = await import("./inventoryWorkbookParse");
const { buildWorkbookBufferLocally } =
  await import("@/services/excelExport/buildWorkbookBuffer");
const { buildExcelExportTexts } =
  await import("@/services/excelExport/exportTexts");
const { translate } = await import("@/test/translate");

const parts = {
  fileStem: "!Inventorization_Тест",
  sheetSpec: {
    headers: ["№", "Индивидуальный номер компонента"],
    keysOrder: ["index", "component_uid"],
    rows: [{ index: 1, component_uid: "0001" }],
  },
  registryEntry: {
    components: [
      { id: "c1", component_uid: "0001", photo: "zip:Photos/0001.jpg" },
    ],
    photoEntries: [{ path: "Photos/0001.jpg", blob: new Blob(["jpg"]) }],
    photoPaths: {},
  },
  schemaEntries: [],
};

async function leakWorkbook() {
  return buildWorkbookBufferLocally({
    orderedLeaks: [{ id: 1, leak_id: "4334" }],
    orderedRows: [{ leak_id: "4334" }],
    headers: ["Tag"],
    keysOrder: ["leak_id"],
    photoMap: {},
    texts: buildExcelExportTexts(translate),
    monitoringExportMode: "full",
    archivePayload: null,
  });
}

async function archive(build) {
  const zip = new JSZip();
  await build(zip);
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "!Database_Тест.zip", { type: "application/zip" });
}

describe("extractBundledInventory", () => {
  it("достаёт инвентаризацию из папки рядом с отчётом — как её отдельную выгрузку", async () => {
    const file = await archive(async (zip) => {
      zip.file("Database/!Database_Тест.xlsx", await leakWorkbook());
      await addInventoryFiles(zip, parts, "Инвентаризация");
    });

    const inventory = await extractBundledInventory(file);

    expect(inventory?.name).toBe("!Inventorization_Тест.zip");
    const inner = await JSZip.loadAsync(await inventory.arrayBuffer());
    expect(
      Object.keys(inner.files).filter((name) => !inner.files[name].dir),
    ).toEqual(["!Inventorization_Тест.xlsx", "Photos/0001.jpg"]);
    // Его читает обычный импорт инвентаризации.
    const cards = await readInventoryArchiveCards(inventory, null);
    expect(cards?.map((card) => card.component_uid)).toEqual(["0001"]);
  }, 60_000);

  it("молчит, когда инвентаризации рядом нет", async () => {
    const file = await archive(async (zip) => {
      zip.file("Database/!Database_Тест.xlsx", await leakWorkbook());
    });
    expect(await extractBundledInventory(file)).toBeNull();
  }, 60_000);

  it("не трогает отдельную выгрузку инвентаризации: она и так в корне", async () => {
    const file = await archive((zip) => addInventoryFiles(zip, parts));
    expect(await extractBundledInventory(file)).toBeNull();
  }, 60_000);

  it("не падает на файле, который не архив", async () => {
    expect(
      await extractBundledInventory(new File(["not a zip"], "x.xlsx")),
    ).toBeNull();
  });
});
