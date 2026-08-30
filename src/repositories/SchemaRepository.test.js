import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  getState: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  save: vi.fn(),
  getStrict: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@/repositories/idb", () => ({
  createIdbStore: () => ({
    open: mocks.open,
    getState: mocks.getState,
    subscribe: mocks.subscribe,
    save: mocks.save,
    getStrict: mocks.getStrict,
    remove: mocks.remove,
  }),
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    mkdir: vi.fn(),
  },
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
}));

const { SchemaRepository, SchemaStorageError } =
  await import("./SchemaRepository");

const project = { id: "p1", folderName: "buzahur" };
const schema = {
  id: "s1",
  name: "Схема УППГ.png",
  type: "image/png",
  size: 10,
};

describe("SchemaRepository on web", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockReturnValue({ ready: true });
    mocks.save.mockResolvedValue(true);
    mocks.getStrict.mockResolvedValue(null);
    mocks.remove.mockResolvedValue(true);
  });

  it("reads an empty list for a project with no schemas", async () => {
    await expect(SchemaRepository.listSchemas(project)).resolves.toEqual([]);
  });

  it("keeps the index and the file bytes under separate keys", async () => {
    // Rendering the list must not drag a 20 MB drawing out of storage.
    await SchemaRepository.addSchema(project, schema, new Blob(["x"]));

    const keys = mocks.save.mock.calls.map(([key]) => key);
    expect(keys).toContain("p1:file:s1");
    expect(keys).toContain("p1:index");
  });

  it("stores the file as a blob rather than base64", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    await SchemaRepository.addSchema(project, schema, blob);

    const fileCall = mocks.save.mock.calls.find(
      ([key]) => key === "p1:file:s1",
    );
    expect(fileCall[1]).toBe(blob);
  });

  it("writes the index only after the bytes are stored", async () => {
    // An index entry pointing at bytes that were never written shows a drawing
    // that cannot open; orphaned bytes are merely wasted space.
    const order = [];
    mocks.save.mockImplementation(async (key) => {
      order.push(key);
      return true;
    });

    await SchemaRepository.addSchema(project, schema, new Blob(["x"]));
    expect(order.indexOf("p1:file:s1")).toBeLessThan(order.indexOf("p1:index"));
  });

  it("does not add an index entry when the file cannot be stored", async () => {
    mocks.save.mockResolvedValueOnce(false);

    await expect(
      SchemaRepository.addSchema(project, schema, new Blob(["x"])),
    ).rejects.toMatchObject({ code: "SCHEMA_FILE_WRITE_FAILED" });

    const keys = mocks.save.mock.calls.map(([key]) => key);
    expect(keys).not.toContain("p1:index");
  });

  it("appends to what is already there instead of replacing it", async () => {
    mocks.getStrict.mockImplementation(async (key) =>
      key === "p1:index"
        ? { version: 1, updatedAt: 1, data: [{ id: "old", name: "a.png" }] }
        : null,
    );

    await SchemaRepository.addSchema(project, schema, new Blob(["x"]));

    const indexCall = mocks.save.mock.calls.find(([key]) => key === "p1:index");
    expect(indexCall[1].data.map((entry) => entry.id)).toEqual(["old", "s1"]);
  });

  it("returns the stored blob for the viewer", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    mocks.getStrict.mockImplementation(async (key) =>
      key === "p1:file:s1" ? blob : null,
    );

    await expect(
      SchemaRepository.readSchemaFile(project, schema),
    ).resolves.toBe(blob);
  });

  it("reports a missing file as null rather than throwing", async () => {
    mocks.getStrict.mockResolvedValue(null);
    await expect(
      SchemaRepository.readSchemaFile(project, schema),
    ).resolves.toBeNull();
  });

  it("drops the bytes and leaves a tombstone in their place", async () => {
    // Байты уходят, а запись остаётся надгробием: без него схема вернётся с
    // соседнего телефона при первом же обмене — для него она просто есть.
    mocks.getStrict.mockImplementation(async (key) =>
      key === "p1:index"
        ? { version: 1, updatedAt: 1, data: [schema, { id: "s2" }] }
        : null,
    );

    await expect(SchemaRepository.removeSchema(project, schema)).resolves.toBe(
      true,
    );

    expect(mocks.remove).toHaveBeenCalledWith("p1:file:s1");
    const indexCall = mocks.save.mock.calls.find(([key]) => key === "p1:index");
    expect(indexCall[1].data.map((entry) => entry.id)).toEqual(["s1", "s2"]);
    expect(indexCall[1].data[0]).toMatchObject({
      deleted: true,
      name: schema.name,
      size: schema.size,
      deletedAt: expect.any(Number),
    });
  });

  it("не показывает удалённую схему в списке", async () => {
    mocks.getStrict.mockImplementation(async (key) =>
      key === "p1:index"
        ? {
            version: 1,
            updatedAt: 1,
            data: [
              {
                id: "s1",
                name: "старая.pdf",
                size: 10,
                deleted: true,
                deletedAt: 5,
              },
              { id: "s2", name: "живая.pdf", size: 20 },
            ],
          }
        : null,
    );

    await expect(SchemaRepository.listSchemas(project)).resolves.toEqual([
      { id: "s2", name: "живая.pdf", size: 20 },
    ]);
  });

  it("surfaces an index read failure instead of showing no schemas", async () => {
    mocks.getStrict.mockRejectedValue(new Error("boom"));
    await expect(SchemaRepository.listSchemas(project)).rejects.toMatchObject({
      code: "SCHEMA_INDEX_READ_FAILED",
    });
  });

  it("refuses to store without a project", async () => {
    await expect(
      SchemaRepository.addSchema(null, schema, new Blob(["x"])),
    ).rejects.toBeInstanceOf(SchemaStorageError);
  });
});

describe("SchemaRepository on mobile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadNative(filesystem) {
    vi.doMock("@/utils/platform", () => ({ isNative: true }));
    vi.doMock("@capacitor/filesystem", () => ({
      Filesystem: filesystem,
      Directory: { Data: "DATA" },
      Encoding: { UTF8: "utf8" },
    }));
    return (await import("./SchemaRepository")).SchemaRepository;
  }

  it("keeps drawings in their own folder, named by id", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const repository = await loadNative({
      writeFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(new Error("File does not exist")),
      deleteFile: vi.fn(),
    });

    await repository.addSchema(project, schema, new Blob(["x"]));

    // Named by id, not by title: two drawings may share a name, and a rename
    // must not orphan the bytes.
    expect(writeFile.mock.calls[0][0].path).toBe(
      "LeakReports/buzahur/schemas/s1.png",
    );
    expect(writeFile.mock.calls[1][0].path).toBe(
      "LeakReports/buzahur/schemas/index.json",
    );
  });

  it("treats a missing index as an empty list", async () => {
    const repository = await loadNative({
      readFile: vi.fn().mockRejectedValue(new Error("File does not exist")),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      deleteFile: vi.fn(),
    });

    await expect(repository.listSchemas(project)).resolves.toEqual([]);
  });

  it("reads a stored drawing back as a blob of its own type", async () => {
    const repository = await loadNative({
      readFile: vi.fn().mockResolvedValue({ data: globalThis.btoa("hello") }),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      deleteFile: vi.fn(),
    });

    const blob = await repository.readSchemaFile(project, schema);
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("hello");
  });
});
