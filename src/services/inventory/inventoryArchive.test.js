import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildInventoryArchive,
  buildInventoryFileStem,
  INVENTORY_SHEET_NAME,
} from "./inventoryArchive";

const sheetSpec = {
  headers: ["№", "Индивидуальный номер компонента"],
  keysOrder: ["index", "component_uid"],
  rows: [{ index: 1, component_uid: "4242" }],
};

describe("the inventory archive", () => {
  it("names the file after the project, safely for any platform", () => {
    expect(buildInventoryFileStem("Бузахур/2026")).toBe(
      "!Inventorization_Бузахур-2026",
    );
    expect(buildInventoryFileStem("")).toBe("!Inventorization_no_name");
  });

  it("carries the sheet, the cards and the drawings side by side", async () => {
    const blob = await buildInventoryArchive({
      fileStem: "!Inventorization_test",
      sheetSpec,
      registryEntry: {
        path: "components.json",
        content: JSON.stringify({ data: [{ id: "a" }] }),
        photoEntries: [{ path: "Photos/4242.jpg", blob: new Blob(["x"]) }],
      },
      schemaEntries: [{ path: "Schemes/узел.pdf", blob: new Blob(["y"]) }],
    });

    const zip = await new JSZip().loadAsync(blob);
    const names = Object.keys(zip.files);
    expect(names).toContain("!Inventorization_test.xlsx");
    expect(names).toContain("components.json");
    expect(names).toContain("Photos/4242.jpg");
    expect(names).toContain("Schemes/узел.pdf");
  });

  it("points the photo column at the folder beside the workbook", async () => {
    const blob = await buildInventoryArchive({
      fileStem: "!Inventorization_test",
      sheetSpec: {
        headers: ["№", "Индивидуальный номер компонента", "Фото"],
        keysOrder: ["index", "component_uid", "photo"],
        rows: [{ index: 1, component_uid: "4242", photo: "idb://photo_a" }],
        ids: ["a"],
      },
      registryEntry: {
        path: "components.json",
        content: "[]",
        photoPaths: { a: "Photos/4242.jpg" },
      },
      texts: { photo: { open: "Открыть фото", missing: "нет файла" } },
    });

    const zip = await new JSZip().loadAsync(blob);
    const inner = await new JSZip().loadAsync(
      await zip.file("!Inventorization_test.xlsx").async("uint8array"),
    );
    // Гиперссылки книга держит отдельным файлом на лист.
    const relsPath = Object.keys(inner.files).find(
      (name) =>
        name.startsWith("xl/worksheets/_rels/") && name.endsWith(".rels"),
    );
    expect(await inner.file(relsPath).async("string")).toContain(
      "Photos/4242.jpg",
    );
  });

  it("writes the sheet under the name the importer looks for", async () => {
    // The standalone file is read back by name, so this is a contract, not a
    // label: the leak workbook's tab keeps the customer's Russian heading.
    const blob = await buildInventoryArchive({
      fileStem: "!Inventorization_test",
      sheetSpec,
      registryEntry: null,
    });

    const zip = await new JSZip().loadAsync(blob);
    const workbook = await zip
      .file("!Inventorization_test.xlsx")
      .async("uint8array");
    const inner = await new JSZip().loadAsync(workbook);
    const meta = await inner.file("xl/workbook.xml").async("string");
    expect(meta).toContain(INVENTORY_SHEET_NAME);
  });
});
