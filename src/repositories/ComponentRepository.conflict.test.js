import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({ isNative: false }));

const { ComponentRepository } =
  await import("@/repositories/ComponentRepository");
const { COMPONENT_DATASET, createWebDatasetStore } =
  await import("@/repositories/webProjectEnvelopeStore");
const { createWebEnvelope } = await import("@/repositories/webProjectEnvelope");
const { rememberRevision, resetRevisionMemoryForTests } =
  await import("@/repositories/webRevisionGuard");

const project = { id: "conflict-registry", folderName: "conflict-registry" };
const store = createWebDatasetStore(COMPONENT_DATASET);
const card = (id) => ({ id, component_uid: id, updatedAt: 1_000 });

/**
 * Другая вкладка пишет мимо памяти этой: у неё своя, а модуль здесь один на
 * процесс. Запись делается напрямую конвертом в обе копии, после чего память
 * возвращается туда, где её оставила «наша» вкладка.
 */
async function writeFromAnotherTab(components, seenAfterwards) {
  const revisions = await Promise.all([
    store.readRevision(project.id),
    store.readMirrorRevision(project.id),
  ]);
  const envelope = createWebEnvelope(components, {
    previousRevisions: revisions,
  });
  await store.write(project.id, envelope);
  await store.writeMirror(project.id, envelope);
  resetRevisionMemoryForTests();
  rememberRevision(store.keyOf(project.id), seenAfterwards);
}

describe("ComponentRepository.save: правки другой вкладки", () => {
  beforeEach(async () => {
    resetRevisionMemoryForTests();
    await ComponentRepository.remove(project);
  });

  it("сохраняет подряд, когда никто больше не писал", async () => {
    await ComponentRepository.save(project, [card("a")]);
    await ComponentRepository.save(project, [card("a"), card("b")]);

    const stored = await ComponentRepository.load(project);
    expect(stored.map((component) => component.id)).toEqual(["a", "b"]);
  });

  // Вкладка A прочитала реестр, вкладка B завела карточку, и сохранение A
  // стирало её молча — у утечек этот страж был, у реестра нет.
  it("отказывается затирать карточку, заведённую в другой вкладке", async () => {
    await ComponentRepository.save(project, [card("a")]);
    await ComponentRepository.load(project);
    const ourRevision = await store.readRevision(project.id);

    await writeFromAnotherTab([card("a"), card("b")], ourRevision);

    await expect(
      ComponentRepository.save(project, [card("a"), card("c")]),
    ).rejects.toMatchObject({ code: "PROJECT_CHANGED_ELSEWHERE" });

    const stored = await ComponentRepository.load(project);
    expect(stored.map((component) => component.id)).toEqual(["a", "b"]);
  });

  it("после перечитывания снова сохраняет", async () => {
    await ComponentRepository.save(project, [card("a")]);
    const ourRevision = await store.readRevision(project.id);
    await writeFromAnotherTab([card("a"), card("b")], ourRevision);

    const fresh = await ComponentRepository.load(project);
    await ComponentRepository.save(project, [...fresh, card("c")]);

    const stored = await ComponentRepository.load(project);
    expect(stored.map((component) => component.id)).toEqual(["a", "b", "c"]);
  });
});
