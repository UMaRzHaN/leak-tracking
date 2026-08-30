import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addSchema: vi.fn(),
  listSchemas: vi.fn(),
  readIndex: vi.fn(),
  removeSchema: vi.fn(),
  saveIndex: vi.fn(),
}));

vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: {
    addSchema: mocks.addSchema,
    listSchemas: mocks.listSchemas,
    readIndex: mocks.readIndex,
    removeSchema: mocks.removeSchema,
    saveIndex: mocks.saveIndex,
  },
}));

const {
  buildSchemaArchiveEntries,
  restoreSchemasFromArchive,
  SCHEMA_ARCHIVE_DIR,
  SCHEMA_INDEX_FILE,
} = await import("./schemaArchive");

/** Чертежи без списка: он едет рядом с ними и проверяется отдельно. */
const drawings = (entries) =>
  entries.filter((entry) => entry.name !== SCHEMA_INDEX_FILE);
const { getJSZip } = await import("./runtime");

const project = { id: "p1", folderName: "buzahur" };

describe("building archive entries", () => {
  it("puts drawings in their own folder under their real names", async () => {
    const entries = await buildSchemaArchiveEntries(
      project,
      [{ id: "a", name: "Схема обвязки устья.pdf" }],
      async () => new Blob(["x"]),
    );

    expect(drawings(entries)).toHaveLength(1);
    expect(entries[0].path).toBe(
      `${SCHEMA_ARCHIVE_DIR}/Схема обвязки устья.pdf`,
    );
  });

  it("keeps two identically named drawings apart", async () => {
    const entries = await buildSchemaArchiveEntries(
      project,
      [
        { id: "a", name: "Схема.pdf" },
        { id: "b", name: "Схема.pdf" },
      ],
      async () => new Blob(["x"]),
    );

    expect(drawings(entries).map((entry) => entry.name)).toEqual([
      "Схема.pdf",
      "Схема (2).pdf",
    ]);
  });

  it("skips a drawing whose bytes are gone instead of failing the export", async () => {
    const entries = await buildSchemaArchiveEntries(
      project,
      [
        { id: "a", name: "gone.png" },
        { id: "b", name: "here.png" },
      ],
      async (_project, schema) => (schema.id === "a" ? null : new Blob(["x"])),
    );

    expect(drawings(entries).map((entry) => entry.name)).toEqual(["here.png"]);
  });

  it("survives a storage error on one drawing", async () => {
    const entries = await buildSchemaArchiveEntries(
      project,
      [
        { id: "a", name: "broken.png" },
        { id: "b", name: "fine.png" },
      ],
      async (_project, schema) => {
        if (schema.id === "a") throw new Error("disk error");
        return new Blob(["x"]);
      },
    );

    expect(drawings(entries).map((entry) => entry.name)).toEqual(["fine.png"]);
  });

  it("handles a project with no drawings at all", async () => {
    await expect(
      buildSchemaArchiveEntries(project, undefined, async () => null),
    ).resolves.toEqual([]);
  });
});

describe("restoring from an archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addSchema.mockResolvedValue(undefined);
    mocks.listSchemas.mockResolvedValue([]);
    mocks.readIndex.mockResolvedValue([]);
    mocks.removeSchema.mockResolvedValue(true);
    mocks.saveIndex.mockResolvedValue(undefined);
  });

  async function makeArchive(files) {
    const JSZip = (await getJSZip()).default;
    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content);
    }
    return zip.generateAsync({ type: "blob" });
  }

  it("reads the drawings back into project storage", async () => {
    const archive = await makeArchive({
      "!Database_x.xlsx": "workbook",
      "photos/report/a.jpg": "photo",
      [`${SCHEMA_ARCHIVE_DIR}/Схема УППГ.png`]: "drawing",
      [`${SCHEMA_ARCHIVE_DIR}/Схема обвязки устья.pdf`]: "drawing",
    });

    const result = await restoreSchemasFromArchive(archive, project);

    expect(result).toEqual({ restored: 2, skipped: 0 });
    expect(mocks.addSchema).toHaveBeenCalledTimes(2);
  });

  it("recovers the media type from the name, since a zip carries none", async () => {
    const archive = await makeArchive({
      [`${SCHEMA_ARCHIVE_DIR}/Схема обвязки устья.pdf`]: "drawing",
    });

    await restoreSchemasFromArchive(archive, project);

    const [, schema] = mocks.addSchema.mock.calls[0];
    expect(schema.type).toBe("application/pdf");
    expect(schema.name).toBe("Схема обвязки устья.pdf");
  });

  it("ignores an archive that carries no drawings", async () => {
    const archive = await makeArchive({ "!Database_x.xlsx": "workbook" });
    await expect(restoreSchemasFromArchive(archive, project)).resolves.toEqual({
      restored: 0,
      skipped: 0,
    });
  });

  it("skips a file it could not show anyway", async () => {
    const archive = await makeArchive({
      [`${SCHEMA_ARCHIVE_DIR}/notes.txt`]: "text",
      [`${SCHEMA_ARCHIVE_DIR}/ok.png`]: "drawing",
    });

    await expect(restoreSchemasFromArchive(archive, project)).resolves.toEqual({
      restored: 1,
      skipped: 1,
    });
  });

  it("keeps going when one drawing fails to store", async () => {
    mocks.addSchema
      .mockRejectedValueOnce(new Error("no space"))
      .mockResolvedValueOnce(undefined);

    const archive = await makeArchive({
      [`${SCHEMA_ARCHIVE_DIR}/a.png`]: "drawing",
      [`${SCHEMA_ARCHIVE_DIR}/b.png`]: "drawing",
    });

    await expect(restoreSchemasFromArchive(archive, project)).resolves.toEqual({
      restored: 1,
      skipped: 1,
    });
  });

  it("does nothing without a project", async () => {
    const archive = await makeArchive({
      [`${SCHEMA_ARCHIVE_DIR}/a.png`]: "drawing",
    });
    await expect(restoreSchemasFromArchive(archive, null)).resolves.toEqual({
      restored: 0,
      skipped: 0,
    });
    expect(mocks.addSchema).not.toHaveBeenCalled();
  });

  it("reports nothing restored for a file that is not a zip", async () => {
    await expect(
      restoreSchemasFromArchive(new Blob(["not a zip"]), project),
    ).resolves.toEqual({ restored: 0, skipped: 0 });
  });
});

/**
 * Список схем в архиве и надгробия удалённых.
 *
 * Без списка в архиве едут одни файлы, и приём умел только добавлять: схема,
 * удалённая на одном телефоне, возвращалась с другого при первом же обмене —
 * молча, потому что для второго она просто есть.
 */
describe("удаление схемы переживает обмен", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addSchema.mockResolvedValue(undefined);
    mocks.listSchemas.mockResolvedValue([]);
    mocks.readIndex.mockResolvedValue([]);
    mocks.removeSchema.mockResolvedValue(true);
    mocks.saveIndex.mockResolvedValue(undefined);
  });

  const drawing = (extra = {}) => ({
    id: "s1",
    name: "узел.pdf",
    size: 3,
    type: "application/pdf",
    addedAt: "2026-02-25T10:00:00.000Z",
    ...extra,
  });

  async function archiveWith(index, files = {}) {
    const JSZip = (await getJSZip()).default;
    const zip = new JSZip();
    for (const [path, content] of Object.entries(files))
      zip.file(path, content);
    zip.file(
      `${SCHEMA_ARCHIVE_DIR}/${SCHEMA_INDEX_FILE}`,
      JSON.stringify({ version: 1, data: index }),
    );
    return zip.generateAsync({ type: "blob" });
  }

  it("надгробие из архива уносит здешний чертёж вместе с байтами", async () => {
    mocks.readIndex.mockResolvedValue([drawing()]);
    const archive = await archiveWith([
      {
        name: "узел.pdf",
        size: 3,
        deleted: true,
        deletedAt: 1_772_200_000_000,
      },
    ]);

    const result = await restoreSchemasFromArchive(archive, project);

    expect(mocks.removeSchema).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ id: "s1" }),
    );
    expect(mocks.addSchema).not.toHaveBeenCalled();
    expect(result.restored).toBe(0);
  });

  it("удалённая здесь схема не возвращается из чужого архива", async () => {
    // Обратная сторона: надгробие держится здесь, а чертёж приезжает оттуда.
    mocks.readIndex.mockResolvedValue([
      {
        id: "s1",
        name: "узел.pdf",
        size: 3,
        deleted: true,
        deletedAt: 1_772_200_000_000,
      },
    ]);
    const archive = await archiveWith([{ ...drawing(), file: "узел.pdf" }], {
      [`${SCHEMA_ARCHIVE_DIR}/узел.pdf`]: "pdf",
    });

    const result = await restoreSchemasFromArchive(archive, project);

    expect(mocks.addSchema).not.toHaveBeenCalled();
    expect(result.restored).toBe(0);
  });

  it("добавленная позже удаления схема возвращается", async () => {
    // Чертёж удалили, потом добавили обратно — добавление свежее, и оно
    // побеждает надгробие.
    mocks.readIndex.mockResolvedValue([
      {
        id: "s1",
        name: "узел.pdf",
        size: 3,
        deleted: true,
        deletedAt: 1_772_100_000_000,
      },
    ]);
    const archive = await archiveWith(
      [
        {
          ...drawing({ addedAt: "2026-03-02T10:00:00.000Z" }),
          file: "узел.pdf",
        },
      ],
      { [`${SCHEMA_ARCHIVE_DIR}/узел.pdf`]: "pdf" },
    );

    const result = await restoreSchemasFromArchive(archive, project);

    expect(mocks.addSchema).toHaveBeenCalledOnce();
    expect(result.restored).toBe(1);
  });

  it("чертёж из архива приезжает под своим временем добавления", async () => {
    // Не под здешним: по нему решаются споры с надгробиями при следующем
    // обмене, и время чужого приёма сделало бы схему вечно свежее чужого
    // удаления.
    const archive = await archiveWith([{ ...drawing(), file: "узел.pdf" }], {
      [`${SCHEMA_ARCHIVE_DIR}/узел.pdf`]: "pdf",
    });

    await restoreSchemasFromArchive(archive, project);

    expect(mocks.addSchema).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ addedAt: "2026-02-25T10:00:00.000Z" }),
      expect.any(Blob),
    );
    // Имя файла в архиве — свойство архива, а не схемы.
    expect(mocks.addSchema.mock.calls[0][1].file).toBeUndefined();
  });

  it("сведённый список сохраняется вместе с надгробиями", async () => {
    mocks.readIndex.mockResolvedValue([drawing()]);
    const archive = await archiveWith([
      {
        name: "другая.pdf",
        size: 9,
        deleted: true,
        deletedAt: 1_772_200_000_000,
      },
    ]);

    await restoreSchemasFromArchive(archive, project);

    const [, saved] = mocks.saveIndex.mock.calls[0];
    expect(saved.map((entry) => entry.name).sort()).toEqual([
      "другая.pdf",
      "узел.pdf",
    ]);
  });

  it("архив без списка читается по-прежнему", async () => {
    // Из версии, которая списка ещё не писала: надгробий там нет, и приём
    // добавляет незнакомые файлы, как раньше.
    const JSZip = (await getJSZip()).default;
    const zip = new JSZip();
    zip.file(`${SCHEMA_ARCHIVE_DIR}/узел.pdf`, "pdf");
    const archive = await zip.generateAsync({ type: "blob" });

    const result = await restoreSchemasFromArchive(archive, project);

    expect(result.restored).toBe(1);
    expect(mocks.saveIndex).not.toHaveBeenCalled();
  });
});
