import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Архив импорта живёт в воркере, а реестр и чертежи заново открывают тот же
 * файл в главном потоке. Пока сессию воркера никто не закрывал, она жила ещё
 * 30 секунд простоя — и весь архив лежал в памяти дважды. Здесь проверяется
 * порядок: сессия закрыта раньше, чем начинается восстановление.
 */

const mocks = vi.hoisted(() => ({ events: [], close: vi.fn() }));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: vi.fn().mockResolvedValue([]), save: vi.fn() },
}));
vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));
vi.mock("./backupArchiveSession", async (importOriginal) => {
  const actual = await importOriginal();
  const { parseBackupZip } = await import("./archiveParser");
  return {
    ...actual,
    openArchive: async (file) => {
      const archive = await parseBackupZip(file);
      mocks.close.mockImplementation(() => mocks.events.push("close"));
      archive.photos.close = mocks.close;
      return archive;
    },
  };
});
vi.mock("./projectExtrasRestore", () => ({
  restoreProjectSchemas: vi.fn(async () => {
    mocks.events.push("schemas");
    return { restored: 0, skipped: 0 };
  }),
  restoreProjectComponents: vi.fn(async () => {
    mocks.events.push("components");
    return { added: 0, updated: 0, conflicts: 0 };
  }),
}));

const { buildProjectBackupZip, importIntoExistingProject, importProjectZip } =
  await import("./projectBackupService");
const { LeakRepository } = await import("@/repositories/LeakRepository");

const PROJECT = {
  id: "project-release",
  name: "Release",
  type: "upstream",
  folderName: "release",
};

afterEach(() => {
  mocks.events.length = 0;
  vi.restoreAllMocks();
});

const archive = () =>
  buildProjectBackupZip({
    leaks: [{ id: "leak-1", status: "open" }],
    idbGet: null,
    project: PROJECT,
    vars: null,
  });

describe("сессия архива закрывается до реестра и чертежей", () => {
  it("новый проект", async () => {
    const ctx = {
      addProject: vi.fn(() => {
        ctx.activeProjectIdRef.current = PROJECT.id;
        return PROJECT;
      }),
      removeProject: vi.fn(),
      savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: null },
      photoReadyRef: { current: true },
    };

    await importProjectZip(await archive(), ctx);

    expect(mocks.events).toEqual(["close", "schemas", "components"]);
  });

  it("слияние в существующий проект", async () => {
    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);
    vi.spyOn(LeakRepository, "saveAll").mockResolvedValue(undefined);
    const ctx = {
      overwriteProject: vi.fn((id) => {
        ctx.activeProjectIdRef.current = id;
        return true;
      }),
      savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: PROJECT.id },
      photoReadyRef: { current: true },
      existingProject: PROJECT,
    };

    await importIntoExistingProject(await archive(), ctx, "merge");

    expect(mocks.events).toEqual(["close", "components", "schemas"]);
  });
});
