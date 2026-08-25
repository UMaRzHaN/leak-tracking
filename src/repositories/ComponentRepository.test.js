import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

vi.mock("@/utils/platform", () => ({ isNative: false }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn() },
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
}));

const project = { id: "p1", folderName: "buzahur" };

const PRIMARY_DB = "LeakTrackingDataDB";
const MIRROR_DB = "LeakTrackingMirrorDB";
const LEGACY_DB = "LeakTrackingComponentsDB";
// Реестр лежит своим набором в тех же сторах, что и утечки: ключ записи
// отличает один от другого.
const RECORD_KEY = `components:${project.id}`;

async function loadRepository() {
  vi.resetModules();
  global.indexedDB = new IDBFactory();
  return import("./ComponentRepository");
}

function openRaw(name, stores) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readMeta(dbName) {
  const db = await openRaw(dbName, ["projects", "projectsData"]);
  const meta = await new Promise((resolve, reject) => {
    const request = db
      .transaction("projects", "readonly")
      .objectStore("projects")
      .get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return meta;
}

/** Кладёт реестр туда, где он лежал до переезда в общую базу. */
async function seedLegacyRegistry(value) {
  const db = await openRaw(LEGACY_DB, ["components"]);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("components", "readwrite");
    tx.objectStore("components").put({
      id: project.id,
      data: value,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readLegacyRegistry() {
  const db = await openRaw(LEGACY_DB, ["components"]);
  const record = await new Promise((resolve, reject) => {
    const request = db
      .transaction("components", "readonly")
      .objectStore("components")
      .get(project.id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function readPayload(dbName) {
  const db = await openRaw(dbName, ["projects", "projectsData"]);
  const record = await new Promise((resolve, reject) => {
    const request = db
      .transaction("projectsData", "readonly")
      .objectStore("projectsData")
      .get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record?.data ?? null;
}

async function countJournal(dbName) {
  const db = await openRaw(dbName, ["projects", "projectsData"]);
  if (!db.objectStoreNames.contains("projectsJournal")) {
    db.close();
    return 0;
  }
  const entries = await new Promise((resolve, reject) => {
    const request = db
      .transaction("projectsJournal", "readonly")
      .objectStore("projectsJournal")
      .getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entries.filter((entry) => entry.projectId === RECORD_KEY).length;
}

beforeEach(() => localStorage.clear());

describe("ComponentRepository on web", () => {
  it("reads an empty registry before anyone has walked", async () => {
    const { ComponentRepository } = await loadRepository();
    await expect(ComponentRepository.load(project)).resolves.toEqual([]);
  });

  it("returns nothing for a project that does not exist", async () => {
    const { ComponentRepository } = await loadRepository();
    await expect(ComponentRepository.load(null)).resolves.toEqual([]);
  });

  it("кладёт реестр в общую базу, а не в свою", async () => {
    const { ComponentRepository } = await loadRepository();
    await ComponentRepository.save(project, [{ component_uid: "1" }]);

    // Ключ набора, а не голый идентификатор проекта: под ним лежат утечки.
    const meta = await readMeta(PRIMARY_DB);
    expect(meta).toBeTruthy();
    expect(meta.revision).toBeGreaterThan(0);
    expect(meta.checksum).toEqual(expect.any(String));
  });

  it("держит вторую копию — ту, которой у реестра не было вовсе", async () => {
    const { ComponentRepository } = await loadRepository();
    await ComponentRepository.save(project, [{ component_uid: "1" }]);

    const primary = await readMeta(PRIMARY_DB);
    const mirror = await readMeta(MIRROR_DB);
    expect(mirror).toBeTruthy();
    expect(mirror.checksum).toBe(primary.checksum);
    expect(mirror.revision).toBe(primary.revision);
  });

  it("читает записанное обратно", async () => {
    const { ComponentRepository } = await loadRepository();
    await ComponentRepository.save(project, [
      { component_uid: "1", component: "Задвижка" },
    ]);

    const loaded = await ComponentRepository.load(project);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].component).toBe("Задвижка");
  });

  it("normalizes records on the way in", async () => {
    const { ComponentRepository } = await loadRepository();
    const stored = await ComponentRepository.save(
      project,
      [{ component_uid: " 7 ", nominal_diameter: "400" }],
      { numericKeys: ["nominal_diameter"], now: 1_700_000_000_000 },
    );

    expect(stored[0].component_uid).toBe("7");
    expect(stored[0].nominal_diameter).toBe(400);
    expect(stored[0].id).toEqual(expect.any(String));
    expect(stored[0].updatedAt).toBe(1_700_000_000_000);
  });

  it("переносит обход из прежней отдельной базы и не стирает его оттуда", async () => {
    // Переезд, теряющий обход, хуже лишней копии: файл остаётся как запасной.
    await loadRepository();
    await seedLegacyRegistry({
      version: 1,
      updatedAt: 1,
      data: [{ id: "a", component_uid: "1" }],
    });
    const { ComponentRepository } = await import("./ComponentRepository");

    await expect(ComponentRepository.load(project)).resolves.toHaveLength(1);
    // Прочитанное сразу же чинит обе копии в общей базе.
    expect(await readMeta(PRIMARY_DB)).toBeTruthy();
    expect(await readMeta(MIRROR_DB)).toBeTruthy();
    expect(await readLegacyRegistry()).toBeTruthy();
  });

  it("still reads a bare array left by an older build", async () => {
    // "Empty" is indistinguishable from "walk not started" — misreading a
    // legacy shape would quietly invite somebody to redo a day of work.
    await loadRepository();
    await seedLegacyRegistry([{ id: "a", component_uid: "3" }]);
    const { ComponentRepository } = await import("./ComponentRepository");

    await expect(ComponentRepository.load(project)).resolves.toHaveLength(1);
  });

  it("не даёт прежней базе перебить то, что записано после переезда", async () => {
    const { ComponentRepository } = await loadRepository();
    await seedLegacyRegistry({
      version: 1,
      updatedAt: 1,
      data: [{ id: "old", component_uid: "1" }],
    });
    await ComponentRepository.save(project, [
      { id: "new", component_uid: "2" },
    ]);

    const loaded = await ComponentRepository.load(project);
    expect(loaded.map((card) => card.id)).toEqual(["new"]);
  });

  it("поднимает реестр из зеркала, когда основная копия пуста", async () => {
    const { ComponentRepository } = await loadRepository();
    await ComponentRepository.save(project, [{ component_uid: "1" }]);

    // Основная копия исчезла — зеркало за тем и держат.
    const db = await openRaw(PRIMARY_DB, ["projects", "projectsData"]);
    await new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const { ComponentRepository: reopened } =
      await import("./ComponentRepository");
    await expect(reopened.load(project)).resolves.toHaveLength(1);
  });

  it("surfaces a read failure rather than reading as empty", async () => {
    const { ComponentRepository, ComponentDataError } = await loadRepository();
    // Испорченный конверт: контрольная сумма не сходится с полезной нагрузкой.
    const db = await openRaw(PRIMARY_DB, ["projects", "projectsData"]);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["projects", "projectsData"], "readwrite");
      tx.objectStore("projects").put({
        id: RECORD_KEY,
        version: 1,
        revision: 5,
        updatedAt: 5,
        deleted: false,
        checksum: "deadbeef",
        journalSeq: 0,
      });
      tx.objectStore("projectsData").put({
        id: RECORD_KEY,
        data: [{ id: "a" }],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    // Зеркала тоже нет — значит, читать нечего и молчать об этом нельзя.
    await expect(ComponentRepository.load(project)).rejects.toBeInstanceOf(
      ComponentDataError,
    );
  });

  it("deletes a project's registry from both copies and from the old database", async () => {
    const { ComponentRepository } = await loadRepository();
    await ComponentRepository.save(project, [{ component_uid: "1" }]);
    await seedLegacyRegistry({ version: 1, updatedAt: 1, data: [{ id: "a" }] });

    await expect(ComponentRepository.remove(project)).resolves.toBe(true);

    expect(await readMeta(PRIMARY_DB)).toBeNull();
    expect(await readMeta(MIRROR_DB)).toBeNull();
    // Иначе проект, заведённый потом под тем же идентификатором, поднял бы
    // оттуда переездом чужие карточки.
    expect(await readLegacyRegistry()).toBeNull();
  });

  it("отказывается писать без проекта и не тем, что не список", async () => {
    const { ComponentRepository, ComponentDataError } = await loadRepository();
    await expect(ComponentRepository.save(null, [])).rejects.toBeInstanceOf(
      ComponentDataError,
    );
    await expect(
      ComponentRepository.save(project, "не список"),
    ).rejects.toBeInstanceOf(ComponentDataError);
  });
  it("одна исправленная карточка пишется дельтой, а не копией всего обхода", async () => {
    const { ComponentRepository } = await loadRepository();
    const walk = Array.from({ length: 40 }, (_, index) => ({
      id: `c${index}`,
      component_uid: String(index + 1),
    }));
    const stored = await ComponentRepository.save(project, walk);
    const snapshotBefore = await readPayload(PRIMARY_DB);

    const edited = stored.map((card) =>
      card.id === "c7" ? { ...card, manufacturer: "Завод" } : card,
    );
    await ComponentRepository.save(project, edited, { previous: stored });

    // Снимок остался прежним: правка легла записью в журнал. Раньше так умело
    // только устройство, а веб переписывал весь обход на каждую карточку.
    expect(await readPayload(PRIMARY_DB)).toEqual(snapshotBefore);
    expect(await countJournal(PRIMARY_DB)).toBe(1);

    // И читается при этом уже исправленное.
    const loaded = await ComponentRepository.load(project);
    expect(loaded.find((card) => card.id === "c7").manufacturer).toBe("Завод");
  });

  it("удаление проекта уносит его реестр той же транзакцией", async () => {
    // Реестр, переживший свой проект, доставался тому, кого заводили следующим.
    const { ComponentRepository } = await loadRepository();
    const { LeakRepository } = await import("./LeakRepository");

    await ComponentRepository.save(project, [{ component_uid: "1" }]);
    await LeakRepository.purge({
      projectId: project.id,
      folderName: project.folderName,
    });

    expect(await readMeta(PRIMARY_DB)).toBeNull();
    expect(await readMeta(MIRROR_DB)).toBeNull();
    await expect(ComponentRepository.load(project)).resolves.toEqual([]);
  });
});
