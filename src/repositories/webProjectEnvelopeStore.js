import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { logger } from "@/utils/logger";
import {
  clearLegacyMirrorEnvelope,
  deleteEnvelope,
  deleteEnvelopes,
  openMirrorDb,
  openWebDataDb,
  readEnvelope,
  readLegacyMirrorEnvelope,
  readStoredRevision,
  saveEnvelope,
  writeEnvelope,
} from "@/repositories/webEnvelopeRecords";
import { normalizeWebEnvelope } from "@/repositories/webProjectEnvelope";

/**
 * Что проект держит в вебе и под какими ключами.
 *
 * Слоем ниже — webEnvelopeRecords.js — лежит одна запись конверта, которой всё
 * равно, чей она. Здесь появляются проект и его наборы данных; какая из копий
 * свежее и что показать человеку, решают репозитории.
 */

/* =========================================================================
   НАБОРЫ ДАННЫХ ПРОЕКТА
   =========================================================================

   У проекта не один набор записей, а несколько: утечки и реестр компонентов.
   Лежат они в одних и тех же сторах, различаясь только ключом записи, — ровно
   как на устройстве, где реестр арендует у той же таблицы SQLite собственный
   ключ проекта. Отсюда три вещи, ради которых всё и делалось.

   Во-первых, наборы читаются и удаляются **одной транзакцией**. «Кто держит
   эту фотографию» — вопрос к обоим сразу, и ответ, собранный из двух разных
   транзакций, неверен настолько, насколько между ними успели записать; а
   удаление проекта, разложенное на несколько транзакций, умеет оборваться
   посередине.

   Во-вторых, реестр получает даром всё, что было построено для утечек:
   ревизию, контрольную сумму, зеркальную копию и журнал дельт. До этого он
   лежал в отдельной базе одной записью без единой из этих защит — притом что
   инвентаризация месторождения теряется дороже, чем день утечек.

   В-третьих, ключ утечек не меняется. Они лежат под голым идентификатором
   проекта, как их клали все прежние сборки: миграция, которой нет, — это
   миграция, которая не потеряет данные.
   ========================================================================= */

export const LEAK_DATASET = "leaks";
export const COMPONENT_DATASET = "components";

/** Всё, что проект держит в этих базах. Порядок роли не играет. */
const PROJECT_DATASETS = [LEAK_DATASET, COMPONENT_DATASET];

/** @param {string} dataset @param {string} projectId */
export function datasetRecordKey(dataset, projectId) {
  return dataset === LEAK_DATASET ? projectId : `${dataset}:${projectId}`;
}

/**
 * Доступ к одному набору данных проекта в основной копии и в зеркальной.
 *
 * `legacyMirror` — только у утечек: разбираться со схемой v2, где зеркало
 * лежало стором внутри основной базы, больше некому, а набор, появившийся
 * после неё, там ничего найти не может по построению.
 *
 * @param {string} dataset
 * @param {{legacyMirror?: boolean}} [options]
 */
export function createWebDatasetStore(dataset, { legacyMirror = false } = {}) {
  const keyOf = (projectId) => datasetRecordKey(dataset, projectId);

  /**
   * Reads the secondary copy, preferring the dedicated mirror database and
   * falling back to the schema-v2 store only when the former has nothing yet.
   * A read error from the mirror database propagates — that is a real signal
   * the caller must weigh — while the legacy fallback stays silent.
   *
   * Finding a schema-v2 copy also migrates it, because nothing else will: to
   * callers this value simply *is* the mirror, so the repair logic upstream
   * sees an up-to-date mirror and never writes it to its new home. Doing it
   * here keeps that one-time move invisible to LeakRepository. The copy is
   * returned whether or not the move succeeds — a project that cannot be
   * migrated yet must still be readable.
   */
  async function readMirror(projectId) {
    const key = keyOf(projectId);
    const current = await readEnvelope(openMirrorDb, key);
    if (current != null) return current;
    if (!legacyMirror) return null;

    const legacy = await readLegacyMirrorEnvelope(key);
    if (legacy == null) return null;

    try {
      const migrated = await writeEnvelope(openMirrorDb, key, legacy);
      if (migrated) await clearLegacyMirrorEnvelope(key);
    } catch {
      // The schema-v2 entry stays put and will be retried on the next read.
    }
    return legacy;
  }

  async function writeMirror(projectId, envelope, mutation = null) {
    const key = keyOf(projectId);
    const saved = await saveEnvelope(openMirrorDb, key, envelope, mutation);
    // Only once the dedicated database is confirmed to hold this envelope is
    // the schema-v2 entry redundant. Dropping it earlier could discard the
    // only remaining backup.
    if (saved && legacyMirror) await clearLegacyMirrorEnvelope(key);
    return saved;
  }

  async function deleteMirror(projectId) {
    const key = keyOf(projectId);
    const deleted = await deleteEnvelope(openMirrorDb, key);
    if (legacyMirror) await clearLegacyMirrorEnvelope(key);
    return deleted;
  }

  return {
    dataset,
    keyOf,
    read: (projectId) => readEnvelope(openWebDataDb, keyOf(projectId)),
    write: (projectId, envelope, mutation = null) =>
      saveEnvelope(openWebDataDb, keyOf(projectId), envelope, mutation),
    remove: (projectId) => deleteEnvelope(openWebDataDb, keyOf(projectId)),
    readRevision: (projectId) =>
      readStoredRevision(openWebDataDb, keyOf(projectId)),
    readMirror,
    writeMirror,
    deleteMirror,
    readMirrorRevision: (projectId) =>
      readStoredRevision(openMirrorDb, keyOf(projectId)),
  };
}

const leakDataset = createWebDatasetStore(LEAK_DATASET, { legacyMirror: true });

export const readWebData = leakDataset.read;
export const writeWebData = leakDataset.write;
export const readWebDataRevision = leakDataset.readRevision;
export const readMirrorData = leakDataset.readMirror;
export const writeMirrorData = leakDataset.writeMirror;
export const readMirrorDataRevision = leakDataset.readMirrorRevision;

/**
 * Стирает проект целиком — все его наборы, в обеих базах, одной транзакцией
 * на базу.
 *
 * Наборы уходят вместе, а не по очереди, потому что удаление, разложенное на
 * несколько транзакций, умеет оборваться посередине. Реестр, переживший свой
 * проект, — не абстракция: пока он лежал отдельной базой, проект, заведённый
 * потом под тем же именем папки, поднимал чужие карточки, которых человек не
 * заводил.
 *
 * @param {string} projectId
 */
export async function purgeWebProject(projectId) {
  if (!projectId) return false;
  const keys = PROJECT_DATASETS.map((dataset) =>
    datasetRecordKey(dataset, projectId),
  );

  const [primary, mirror] = await Promise.all([
    deleteEnvelopes(openWebDataDb, keys),
    deleteEnvelopes(openMirrorDb, keys),
  ]);
  for (const key of keys) await clearLegacyMirrorEnvelope(key);
  return primary || mirror;
}

// Read-only: projects saved before schema v2 kept their only secondary copy
// as a full envelope in localStorage. This is consulted so those projects
// keep working across the upgrade, but nothing writes a full envelope back
// to localStorage anymore — new/ongoing secondary copies live in
// WEB_MIRROR_STORE instead. Once a project's IndexedDB copies are confirmed
// current the legacy key is removed (see clearLegacyLocalStorageEnvelope).
export function readLegacyLocalStorageEnvelope(projectId) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return normalizeWebEnvelope(JSON.parse(raw), `localStorage[${key}]`);
}

export function clearLegacyLocalStorageEnvelope(projectId) {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(projectId));
  } catch (error) {
    // Best effort: leaving the legacy key behind is harmless once both
    // IndexedDB copies hold data at least as fresh as it.
    logger.warn(
      `[LeakRepository] Could not remove the legacy localStorage copy for "${projectId}":`,
      error,
    );
  }
}

// Last-resort fallback used only when neither IndexedDB store accepted a
// write (most commonly: IndexedDB is entirely unavailable in this browser).
// This is the only place that still writes a full envelope to localStorage,
// and it exists purely so the project keeps working somewhere durable in
// that narrow case — exactly like every web save did before schema v2.
export function writeLegacyLocalStorageEnvelope(projectId, envelope) {
  const key = STORAGE_KEYS.PROJECT_DATA(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch (error) {
    logger.warn(
      `[LeakRepository] Could not write the localStorage fallback copy for "${key}":`,
      error,
    );
    return false;
  }
}
