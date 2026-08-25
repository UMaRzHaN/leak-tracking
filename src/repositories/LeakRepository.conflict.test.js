import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { LeakRepository } = await import("@/repositories/LeakRepository");
const { readWebDataRevision, writeWebData } =
  await import("@/repositories/webProjectEnvelopeStore");
const { createWebEnvelope } = await import("@/repositories/webProjectEnvelope");
const { resetRevisionMemoryForTests } =
  await import("@/repositories/webRevisionGuard");

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
});
