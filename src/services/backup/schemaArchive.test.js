import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addSchema: vi.fn(),
  listSchemas: vi.fn(),
}));

vi.mock("@/repositories/SchemaRepository", () => ({
  SchemaRepository: {
    addSchema: mocks.addSchema,
    listSchemas: mocks.listSchemas,
  },
}));

const {
  buildSchemaArchiveEntries,
  restoreSchemasFromArchive,
  SCHEMA_ARCHIVE_DIR,
} = await import("./schemaArchive");
const { getJSZip } = await import("./runtime");

const project = { id: "p1", folderName: "buzahur" };

describe("building archive entries", () => {
  it("puts drawings in their own folder under their real names", async () => {
    const entries = await buildSchemaArchiveEntries(
      project,
      [{ id: "a", name: "Схема обвязки устья.pdf" }],
      async () => new Blob(["x"]),
    );

    expect(entries).toHaveLength(1);
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

    expect(entries.map((entry) => entry.name)).toEqual([
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

    expect(entries.map((entry) => entry.name)).toEqual(["here.png"]);
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

    expect(entries.map((entry) => entry.name)).toEqual(["fine.png"]);
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
