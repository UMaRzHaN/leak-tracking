import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  restoreComponents: vi.fn(),
  restoreSchemas: vi.fn(),
}));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.load, save: mocks.save },
}));
vi.mock("@/services/backup/componentArchive", async () => {
  const { mergeComponentRegistries } = await import("@/domain/componentMerge");
  return {
    restoreComponentsFromArchive: mocks.restoreComponents,
    // Настоящее сведение поверх мока хранилища: путь через служебный лист
    // должен отличаться от json только источником карточек.
    mergeIncomingComponents: async (project, incoming) => {
      const local = await mocks.load(project);
      const { merged, added, updated, conflicts } = mergeComponentRegistries(
        local,
        incoming,
      );
      await mocks.save(project, merged);
      return { added, updated, conflicts: conflicts.length };
    },
  };
});
vi.mock("@/services/backup/schemaArchive", () => ({
  restoreSchemasFromArchive: mocks.restoreSchemas,
}));

const { importInventoryFile, separateSheetCards } =
  await import("./inventoryImport");
const { componentIdFromUid } = await import("./inventorySheet");
const ExcelJS = (await import("exceljs")).default;

const project = { id: "p1", folderName: "buzahur" };
const excel = {
  headers: [
    "№",
    "Индивидуальный номер компонента",
    "Инвентаризационный номер на схеме",
  ],
  keysOrder: ["index", "component_uid", "scheme_tag"],
};

async function sheetFile(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Inventorization");
  sheet.addRow(excel.headers);
  for (const row of rows) sheet.addRow(row);
  return new File([await book.xlsx.writeBuffer()], "inventory.xlsx");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue([]);
  mocks.save.mockImplementation(async (_project, list) => list);
  mocks.restoreComponents.mockResolvedValue({
    added: 0,
    updated: 0,
    conflicts: 0,
  });
  mocks.restoreSchemas.mockResolvedValue({ restored: 0, skipped: 0 });
});

describe("importing an inventory", () => {
  it("prefers the archive, which carries the photographs too", async () => {
    mocks.restoreComponents.mockResolvedValue({
      added: 3,
      updated: 1,
      conflicts: 0,
    });
    mocks.restoreSchemas.mockResolvedValue({ restored: 2, skipped: 0 });

    const result = await importInventoryFile(new File([""], "a.zip"), project, {
      excel,
    });

    expect(result).toMatchObject({ source: "archive", added: 3, schemas: 2 });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("falls back to the sheet when no archive cards are present", async () => {
    const file = await sheetFile([[1, "4242", "ЗД32"]]);

    const result = await importInventoryFile(file, project, { excel });

    expect(result).toMatchObject({ source: "sheet", added: 1 });
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("imports the same sheet twice without doubling the registry", async () => {
    const file = await sheetFile([[1, "4242", "ЗД32"]]);
    const first = await importInventoryFile(file, project, { excel });
    mocks.load.mockResolvedValue(mocks.save.mock.calls[0][1]);

    const second = await importInventoryFile(file, project, { excel });

    expect(first.added).toBe(1);
    expect(second.added).toBe(0);
  });
});

describe("a spreadsheet meeting a card written on site", () => {
  it("leaves the field card alone and reports the row", () => {
    const local = [{ id: "uuid-1", component_uid: "4242" }];
    const incoming = [
      { id: componentIdFromUid("4242"), component_uid: "4242" },
    ];

    const { mergeable, shadowed } = separateSheetCards(local, incoming);

    expect(mergeable).toHaveLength(0);
    expect(shadowed).toHaveLength(1);
  });

  it("still updates a card that came from a sheet in the first place", () => {
    const local = [{ id: componentIdFromUid("4242"), component_uid: "4242" }];
    const incoming = [
      { id: componentIdFromUid("4242"), component_uid: "4242" },
    ];

    expect(separateSheetCards(local, incoming).mergeable).toHaveLength(1);
  });
});

describe("реестр внутри книги", () => {
  const cards = [
    { id: "c1", component_uid: "4242", component: "Задвижка", history: [] },
    { id: "c2", component_uid: "4243", component: "Кран шаровой", history: [] },
  ];

  async function archiveWithBackupSheet({ json = null } = {}) {
    const { buildInventoryArchive } = await import("./inventoryArchive");
    const blob = await buildInventoryArchive({
      fileStem: "!Inventorization_test",
      sheetSpec: {
        headers: ["№", "Индивидуальный номер компонента"],
        keysOrder: ["index", "component_uid"],
        rows: cards.map((card, index) => ({
          index: index + 1,
          component_uid: card.component_uid,
        })),
        ids: cards.map((card) => card.id),
        components: cards,
        fields: [],
      },
      registryEntry: { components: cards },
    });

    if (!json) return new File([blob], "!Inventorization_test.zip");

    const JSZip = (await import("jszip")).default;
    const zip = await new JSZip().loadAsync(blob);
    zip.file("components.json", JSON.stringify({ version: 1, data: json }));
    return new File(
      [await zip.generateAsync({ type: "blob" })],
      "!Inventorization_test.zip",
    );
  }

  it("читает карточки из служебного листа, без json рядом", async () => {
    // Ради этого json и убран: архив состоит из книги и папок, как у утечек.
    const result = await importInventoryFile(
      await archiveWithBackupSheet(),
      project,
      { excel },
    );

    expect(result).toMatchObject({ source: "archive", added: 2 });
    expect(
      mocks.save.mock.calls[0][1].map((card) => card.component_uid),
    ).toEqual(["4242", "4243"]);
  });

  it("вносит карточки, даже когда схемы из архива не восстановились", async () => {
    // Схемы — приложение к реестру, а не его условие: упавшее восстановление
    // чертежей не должно отменять уже разобранные карточки.
    mocks.restoreComponents.mockResolvedValue({
      added: 3,
      updated: 0,
      conflicts: 0,
    });
    mocks.restoreSchemas.mockRejectedValue(new Error("архив без чертежей"));
    const archive = new File(["не зип"], "!Inventorization_2026.zip");

    const result = await importInventoryFile(archive, project, { excel });

    expect(result).toMatchObject({ source: "archive", added: 3, schemas: 0 });
  });

  it("всё ещё читает архивы, выгруженные с json", async () => {
    // Их у людей на руках сколько угодно, и они не перестают быть верными.
    mocks.restoreComponents.mockResolvedValue({
      added: 1,
      updated: 0,
      conflicts: 0,
    });
    const legacy = new File(["не зип"], "!Inventorization_old.zip");

    const result = await importInventoryFile(legacy, project, { excel });

    expect(result).toMatchObject({ source: "archive", added: 1 });
    expect(mocks.restoreComponents).toHaveBeenCalled();
  });
});
