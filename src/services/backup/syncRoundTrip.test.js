import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  markProjectVarsUpdated,
  readProjectSyncState,
  recordLeakDeletions,
  writeProjectSyncState,
} from "@/services/sync/projectSyncState";
import {
  buildProjectBackupZip,
  importIntoExistingProject,
} from "./projectBackupService";

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

/**
 * Обмен между телефонами через настоящий архив.
 *
 * Схождение двух телефонов проверяется отдельно и на чистых функциях слияния —
 * архива оно не касается вовсе. Прочие проверки обмена складывают
 * `project.json` руками, то есть смотрят, как импорт читает заранее написанный
 * ключ, но не то, что выгрузка пишет именно его. Между этими двумя половинами
 * и остаётся место для ошибки: договор выгрузки с импортом ничем не охраняется,
 * а стоит ему разойтись — надгробия удалённых записей и отметка переменных
 * молча перестанут ездить, и обмен будет отчитываться об успехе.
 *
 * Поэтому здесь круг целиком: устройство A собирает архив тем же сборщиком, что
 * и приложение, устройство B принимает его в режиме обмена.
 */

const png = (value) => new Blob([value], { type: "image/png" });

// Момент удаления обязан быть новее самой записи: надгробие, выглядящее старше,
// приложение намеренно игнорирует — правка после удаления возвращает запись к
// жизни. С отметкой меньше `updatedAt` проверка мерила бы не то.
const CREATED_AT = 1_772_000_000_000;
const DELETED_AT = 1_772_100_000_000;

/**
 * Свои идентификаторы каждому сценарию.
 *
 * Состояние обмена живёт не только в `localStorage`: у правок есть очередь с
 * памятью внутри модуля, и чистка хранилища её не трогает. С общими
 * идентификаторами поколение, поднятое уплотнением в одном сценарии, роняло
 * соседний.
 */
let scenario = 0;
let deviceA = null;
let deviceB = null;

function newDevices() {
  scenario += 1;
  const shared = {
    name: "Sync Round Trip",
    type: "upstream",
    folderName: `Sync_Round_Trip_${scenario}`,
    syncId: `round-trip-sync-${String(scenario).padStart(4, "0")}`,
  };
  deviceA = { ...shared, id: `device-a-${scenario}` };
  deviceB = { ...shared, id: `device-b-${scenario}` };
}

const leak = (id, extra = {}) => ({
  id,
  leak_id: id.toUpperCase(),
  status: "open",
  object: "дренажная линия",
  component: "Задвижка",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...extra,
});

/** Контекст приёма: та же форма, что даёт приложению экран обмена. */
function receiveContext(project, onSave = () => {}) {
  return {
    existingProject: project,
    overwriteProject: vi.fn(() => true),
    setProjectSyncId: vi.fn(),
    saveRef: { current: vi.fn(async (leaks) => onSave(leaks)) },
    activeProjectIdRef: { current: project.id },
    photoReadyRef: { current: true },
  };
}

/** Архив устройства A — тем же сборщиком, каким его собирает приложение. */
function exportFrom(leaks, { vars = { density: 0.7168 }, photos } = {}) {
  vi.spyOn(LeakRepository, "getAll").mockResolvedValue(leaks);
  return buildProjectBackupZip({
    leaks,
    idbGet: (key) => photos?.get(key) ?? null,
    project: deviceA,
    vars,
  });
}

describe("обмен между телефонами: круг через настоящий архив", () => {
  beforeEach(() => {
    localStorage.clear();
    newDevices();
    vi.spyOn(PhotoRepository, "gcOrphaned").mockResolvedValue(undefined);
    vi.spyOn(PhotoRepository, "save").mockImplementation(
      async (_blob, { leakId }) => `idb://restored-${leakId}`,
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("увозит надгробие удалённой записи и удаляет её у принявшего", async () => {
    const kept = leak("leak-1");
    const removed = leak("leak-2");
    await recordLeakDeletions(deviceA.id, [kept, removed], [kept], DELETED_AT);
    const archive = await exportFrom([kept]);

    // У B запись ещё жива: про удаление он знает только из архива.
    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([kept, removed]);
    let received = null;
    await importIntoExistingProject(
      archive,
      receiveContext(deviceB, (leaks) => (received = leaks)),
      "sync",
    );

    expect(received.map((item) => item.id)).toEqual(["leak-1"]);
  });

  it("сохраняет надгробие у принявшего, чтобы удаление поехало дальше", async () => {
    // Цепочка из трёх телефонов работает только так: принявший обязан унести
    // чужое удаление в своё состояние, иначе оно застрянет на втором звене.
    const kept = leak("leak-1");
    const removed = leak("leak-2");
    await recordLeakDeletions(deviceA.id, [kept, removed], [kept], DELETED_AT);
    const archive = await exportFrom([kept]);

    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([kept, removed]);
    await importIntoExistingProject(archive, receiveContext(deviceB), "sync");

    expect(readProjectSyncState(deviceB.id).deleted).toMatchObject({
      "id:leak-2": DELETED_AT,
    });
  });

  it("отдаёт переменные проекта тому телефону, чья отметка свежее", async () => {
    // По переменным считаются выбросы: разойдись они — два телефона выдадут по
    // одному проекту разные числа.
    const shared = leak("leak-1");
    await markProjectVarsUpdated(deviceA.id, 9_000);
    localStorage.setItem(
      `app:${deviceB.id}:vars_v1`,
      JSON.stringify({ density: 0.5 }),
    );
    await markProjectVarsUpdated(deviceB.id, 1_000);
    const archive = await exportFrom([shared], { vars: { density: 0.9 } });

    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([shared]);
    await importIntoExistingProject(archive, receiveContext(deviceB), "sync");

    expect(
      JSON.parse(localStorage.getItem(`app:${deviceB.id}:vars_v1`)),
    ).toMatchObject({ density: 0.9 });
  });

  it("довозит снимок и запись обхода", async () => {
    const withPhoto = leak("leak-1", {
      photo: "idb://a-before",
      monitoringRecords: [
        {
          id: "m1",
          roundId: "round-1",
          roundNumber: 1,
          date: "2026-07-20T08:30:00.000Z",
          result: "still_leaking",
          photo: "idb://a-monitoring",
        },
      ],
    });
    const archive = await exportFrom([withPhoto], {
      photos: new Map([
        ["a-before", png("before")],
        ["a-monitoring", png("monitoring")],
      ]),
    });

    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([leak("leak-1")]);
    let received = null;
    await importIntoExistingProject(
      archive,
      receiveContext(deviceB, (leaks) => (received = leaks)),
      "sync",
    );

    const merged = received.find((item) => item.id === "leak-1");
    // Пути местные: снимок из архива лёг в хранилище этого устройства.
    expect(merged.photo).toBe("idb://restored-LEAK-1");
    expect(merged.monitoringRecords).toHaveLength(1);
    expect(merged.monitoringRecords[0].photo).toBe(
      "idb://restored-LEAK-1_monitoring_m1",
    );
  });

  it("не меняет данные, когда тот же архив принимают дважды", async () => {
    const shared = leak("leak-1", { photo: "idb://a-before" });
    const archive = await exportFrom([shared], {
      photos: new Map([["a-before", png("before")]]),
    });

    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([leak("leak-1")]);
    let first = null;
    await importIntoExistingProject(
      archive,
      receiveContext(deviceB, (leaks) => (first = leaks)),
      "sync",
    );

    vi.spyOn(LeakRepository, "getAll").mockResolvedValue(first);
    let second = null;
    await importIntoExistingProject(
      archive,
      receiveContext(deviceB, (leaks) => (second = leaks)),
      "sync",
    );

    expect(second).toEqual(first);
  });

  it("отвергает обмен с телефоном, который уплотнил надгробия", async () => {
    // Уплотнение поднимает поколение и меняет эпоху. Принять такой архив как
    // обычный значило бы воскресить всё, что было забыто при уплотнении, —
    // поэтому обмен отвергается до полной передачи проекта.
    const shared = leak("leak-1");
    const many = {};
    for (let index = 0; index <= 10_000; index += 1) {
      many[`id:gone-${index}`] = DELETED_AT + index;
    }
    await writeProjectSyncState(deviceA.id, {
      version: 2,
      generation: 0,
      deleted: many,
    });
    const archive = await exportFrom([shared]);

    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([shared]);
    await expect(
      importIntoExistingProject(archive, receiveContext(deviceB), "sync"),
    ).rejects.toMatchObject({ code: "SYNC_EPOCH_MISMATCH" });
  });
});
