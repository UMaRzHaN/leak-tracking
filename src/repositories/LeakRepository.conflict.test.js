import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

/**
 * Обе базы отказываются принимать запись — так выглядит исчерпанная квота.
 * Мок отдаёт настоящую реализацию, пока флаг не поднят, поэтому остальные
 * проверки в файле его не замечают.
 */
let storageFull = false;
vi.mock("@/repositories/webEnvelopeRecords", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveEnvelope: (...args) => {
      if (!storageFull) return actual.saveEnvelope(...args);
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      return Promise.reject(error);
    },
  };
});

const { LeakRepository } = await import("@/repositories/LeakRepository");
const { readWebDataRevision, writeWebData } =
  await import("@/repositories/webProjectEnvelopeStore");
const { createWebEnvelope } = await import("@/repositories/webProjectEnvelope");
const { resetRevisionMemoryForTests } =
  await import("@/repositories/webRevisionGuard");
const { STORAGE_KEYS } = await import("@/app/project/storageKeys");

const PROJECT = "conflict-project";
const leak = (id) => ({ id, leak_id: id, status: "open" });

/**
 * Другая вкладка пишет мимо памяти этой: у неё своя, а модуль здесь один на
 * процесс. Запись делается напрямую конвертом, после чего память
 * восстанавливается в то состояние, в котором её оставила «наша» вкладка.
 */
async function writeFromAnotherTab(records, seenAfterwards) {
  const current = await readWebDataRevision(PROJECT);
  await writeWebData(
    PROJECT,
    createWebEnvelope(records, { previousRevisions: [current] }),
  );
  resetRevisionMemoryForTests();
  if (seenAfterwards != null) {
    const { rememberRevision } =
      await import("@/repositories/webRevisionGuard");
    rememberRevision(PROJECT, seenAfterwards);
  }
}

describe("LeakRepository.saveAll: правки другой вкладки", () => {
  beforeEach(() => {
    resetRevisionMemoryForTests();
    storageFull = false;
    localStorage.clear();
  });

  it("сохраняет, когда никто больше не писал", async () => {
    await LeakRepository.saveAll([leak("a")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });

    const stored = await LeakRepository.getAll({
      projectId: PROJECT,
      folderName: PROJECT,
    });
    expect(stored.map((record) => record.id)).toEqual(["a"]);
  });

  // Ровно сценарий из аудита: вкладка прочитала набор, другая успела записать,
  // и сохранение затирало её правки целиком и молча.
  it("отказывается затирать более свежую запись", async () => {
    await LeakRepository.saveAll([leak("a")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });
    const ourRevision = await readWebDataRevision(PROJECT);

    await writeFromAnotherTab([leak("a"), leak("b")], ourRevision);

    await expect(
      LeakRepository.saveAll([leak("a"), leak("c")], {
        projectId: PROJECT,
        folderName: PROJECT,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_CHANGED_ELSEWHERE" });
  });

  it("оставляет чужие правки на месте после отказа", async () => {
    await LeakRepository.saveAll([leak("a")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });
    const ourRevision = await readWebDataRevision(PROJECT);
    await writeFromAnotherTab([leak("a"), leak("b")], ourRevision);

    await LeakRepository.saveAll([leak("a"), leak("c")], {
      projectId: PROJECT,
      folderName: PROJECT,
    }).catch(() => undefined);

    const stored = await LeakRepository.getAll({
      projectId: PROJECT,
      folderName: PROJECT,
    });
    expect(stored.map((record) => record.id).sort()).toEqual(["a", "b"]);
  });

  // Перечитал — значит увидел; после этого сохранение обязано пройти, иначе
  // из отказа нет выхода.
  it("пропускает сохранение после перечитывания", async () => {
    await LeakRepository.saveAll([leak("a")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });
    const ourRevision = await readWebDataRevision(PROJECT);
    await writeFromAnotherTab([leak("a"), leak("b")], ourRevision);

    await LeakRepository.getAll({
      projectId: PROJECT,
      folderName: PROJECT,
    });

    await expect(
      LeakRepository.saveAll([leak("a"), leak("b"), leak("c")], {
        projectId: PROJECT,
        folderName: PROJECT,
      }),
    ).resolves.not.toThrow();
  });

  // Кончившееся место — не другая вкладка. Запасная запись уходит в
  // localStorage, и её ревизия обязана попасть в память вкладки: иначе
  // следующее сохранение находит там ревизию свежее запомненной и отказывает,
  // ссылаясь на вкладку, которой нет. Выхода из такого отказа не было —
  // перечитать нечего, набор уже свой.
  it("сохраняет дальше после запасной записи в localStorage", async () => {
    await LeakRepository.saveAll([leak("a")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });

    storageFull = true;
    await LeakRepository.saveAll([leak("a"), leak("b")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });
    storageFull = false;

    await expect(
      LeakRepository.saveAll([leak("a"), leak("b"), leak("c")], {
        projectId: PROJECT,
        folderName: PROJECT,
      }),
    ).resolves.not.toThrow();
  });

  // Починка копий после чтения умеет не состояться, но память вкладки от
  // этого не становится основанной на другой ревизии.
  it("сохраняет дальше, когда копию подняли из localStorage", async () => {
    await LeakRepository.saveAll([leak("a")], {
      projectId: PROJECT,
      folderName: PROJECT,
    });

    // Копия в localStorage свежее обеих в IndexedDB — так остаётся после
    // сеанса, где место кончилось.
    const ahead = createWebEnvelope([leak("a"), leak("b")], {
      previousRevisions: [await readWebDataRevision(PROJECT)],
    });
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_DATA(PROJECT),
      JSON.stringify(ahead),
    );
    resetRevisionMemoryForTests();
    storageFull = true;

    const loaded = await LeakRepository.getAll({
      projectId: PROJECT,
      folderName: PROJECT,
    });
    expect(loaded.map((record) => record.id).sort()).toEqual(["a", "b"]);

    storageFull = false;
    await expect(
      LeakRepository.saveAll([leak("a"), leak("b"), leak("c")], {
        projectId: PROJECT,
        folderName: PROJECT,
      }),
    ).resolves.not.toThrow();
  });
});
