import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.load, save: mocks.save },
}));

const {
  buildComponentArchiveEntry,
  previewArchiveComponents,
  restoreComponentsFromArchive,
  COMPONENT_ARCHIVE_FILE,
} = await import("./componentArchive");
const { getJSZip } = await import("./runtime");

const project = { id: "p1", folderName: "buzahur" };
const card = (id, uid, extra = {}) => ({
  id,
  component_uid: uid,
  updatedAt: 1_000,
  ...extra,
});

async function makeArchive(files) {
  const JSZip = (await getJSZip()).default;
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "blob" });
}

function archivePayload(components) {
  return JSON.stringify({ version: 1, exportedAt: 1, data: components });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue([]);
  mocks.save.mockImplementation(async (_project, list) => list);
});

describe("building the archive entry", () => {
  it("carries the registry as plain JSON beside the workbook", async () => {
    const entry = await buildComponentArchiveEntry(project, async () => [
      card("a", "1"),
    ]);

    expect(entry.path).toBe(COMPONENT_ARCHIVE_FILE);
    expect(JSON.parse(entry.content).data).toHaveLength(1);
  });

  it("carries nothing when the walk has not started", async () => {
    await expect(
      buildComponentArchiveEntry(project, async () => []),
    ).resolves.toBeNull();
  });

  it("leaves the registry out rather than failing the export", async () => {
    // The leaks are the bulk of what an export is for.
    await expect(
      buildComponentArchiveEntry(project, async () => {
        throw new Error("storage down");
      }),
    ).resolves.toBeNull();
  });
});

describe("restoring from an archive", () => {
  it("merges into what this device already walked", async () => {
    mocks.load.mockResolvedValue([card("a", "1")]);
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([card("b", "2")]),
    });

    const result = await restoreComponentsFromArchive(archive, project);

    expect(result).toEqual({ added: 1, updated: 0, removed: 0, conflicts: 0 });
    const [, saved] = mocks.save.mock.calls[0];
    expect(saved.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("довозит удаление: карточка уходит и на этом устройстве", async () => {
    // Ради этого надгробия и заводились. Раньше архив с соседнего телефона
    // возвращал удалённую карточку обратно — молча.
    mocks.load.mockResolvedValue([card("a", "1"), card("b", "2")]);
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([
        { id: "b", component_uid: "2", deleted: true, deletedAt: 9_000 },
      ]),
    });

    const result = await restoreComponentsFromArchive(archive, project);

    expect(result.removed).toBe(1);
    const [, saved] = mocks.save.mock.calls[0];
    // Карточка ушла, но запись о её удалении осталась — иначе следующий обмен
    // вернул бы её снова.
    expect(saved.filter((record) => !record.deleted).map((c) => c.id)).toEqual([
      "a",
    ]);
    expect(saved.find((record) => record.id === "b").deleted).toBe(true);
  });

  it("везёт удаление дальше в архиве, а не только принимает его", async () => {
    const grave = { id: "b", component_uid: "2", deleted: true, deletedAt: 9 };
    const entry = await buildComponentArchiveEntry(project, async () => [
      card("a", "1"),
      grave,
    ]);

    expect(JSON.parse(entry.content).data).toContainEqual(
      expect.objectContaining({ id: "b", deleted: true }),
    );
  });

  it("does not overwrite the half that arrived first", async () => {
    mocks.load.mockResolvedValue([card("a", "1"), card("b", "2")]);
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([card("c", "3")]),
    });

    await restoreComponentsFromArchive(archive, project);

    const [, saved] = mocks.save.mock.calls[0];
    expect(saved).toHaveLength(3);
  });

  it("keeps both cards and reports a collision on the same number", async () => {
    mocks.load.mockResolvedValue([
      card("a", "7", { component_name: "Задвижка" }),
    ]);
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([
        card("b", "7", { component_name: "Манометр" }),
      ]),
    });

    const result = await restoreComponentsFromArchive(archive, project);

    expect(result.conflicts).toBe(1);
    const [, saved] = mocks.save.mock.calls[0];
    expect(saved).toHaveLength(2);
    // Neither card is renumbered on the way in — that is a human's call.
    expect(saved.map((c) => c.component_uid)).toEqual(["7", "7"]);
  });

  it("takes the newer copy of a card seen on both devices", async () => {
    mocks.load.mockResolvedValue([
      card("a", "1", { manufacturer: "старое", updatedAt: 1 }),
    ]);
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([
        card("a", "1", { manufacturer: "новое", updatedAt: 9 }),
      ]),
    });

    const result = await restoreComponentsFromArchive(archive, project);

    expect(result.updated).toBe(1);
    expect(mocks.save.mock.calls[0][1][0].manufacturer).toBe("новое");
  });

  it("ignores an archive from before the registry existed", async () => {
    const archive = await makeArchive({ "!Database_x.xlsx": "workbook" });

    await expect(
      restoreComponentsFromArchive(archive, project),
    ).resolves.toEqual({ added: 0, updated: 0, removed: 0, conflicts: 0 });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not wipe the registry over a corrupt payload", async () => {
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: "{ not json",
    });

    await expect(
      restoreComponentsFromArchive(archive, project),
    ).resolves.toEqual({ added: 0, updated: 0, removed: 0, conflicts: 0 });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("reports nothing merged when storage refuses the write", async () => {
    mocks.save.mockRejectedValue(new Error("no space"));
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([card("a", "1")]),
    });

    await expect(
      restoreComponentsFromArchive(archive, project),
    ).resolves.toEqual({ added: 0, updated: 0, removed: 0, conflicts: 0 });
  });

  it("does nothing without a project", async () => {
    const archive = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([card("a", "1")]),
    });
    await expect(restoreComponentsFromArchive(archive, null)).resolves.toEqual({
      added: 0,
      updated: 0,
      removed: 0,
      conflicts: 0,
    });
  });
});

describe("previewArchiveComponents", () => {
  it("counts what the registry would gain without writing anything", async () => {
    mocks.load.mockResolvedValue([card("c1", "4242", { updatedAt: 1 })]);
    const file = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([
        card("c1", "4242", { updatedAt: 5_000 }),
        card("c2", "4243", { photo: "zip:component_photos/4243.jpg" }),
      ]),
    });

    await expect(previewArchiveComponents(file, project)).resolves.toEqual({
      added: 1,
      updated: 1,
      removed: 0,
      total: 2,
      photos: 1,
    });
    // Предпросмотр ничего не решает и ничего не пишет.
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("stays silent about an archive that carries no registry", async () => {
    const file = await makeArchive({ "backup.json": "[]" });
    await expect(previewArchiveComponents(file, project)).resolves.toBe(null);
  });

  it("stays silent when the registry cannot be read", async () => {
    const file = await makeArchive({ [COMPONENT_ARCHIVE_FILE]: "не json" });
    await expect(previewArchiveComponents(file, project)).resolves.toBe(null);
  });

  it("counts every card as new when no project holds a registry yet", async () => {
    mocks.load.mockResolvedValue([]);
    const file = await makeArchive({
      [COMPONENT_ARCHIVE_FILE]: archivePayload([card("c1", "4242")]),
    });

    await expect(previewArchiveComponents(file, null)).resolves.toMatchObject({
      added: 1,
      updated: 0,
      total: 1,
    });
  });
});
