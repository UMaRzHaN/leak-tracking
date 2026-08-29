import { createIdbStore } from "@/repositories/idb";
import {
  deleteNativeComponents,
  loadNativeComponents,
  saveNativeComponents,
} from "@/repositories/nativeComponentStorage";
import {
  compareWebEnvelopes,
  createWebEnvelope,
  normalizeWebEnvelope,
  sameWebEnvelope,
} from "@/repositories/webProjectEnvelope";
import {
  COMPONENT_DATASET,
  createWebDatasetStore,
} from "@/repositories/webProjectEnvelopeStore";
import { createNativeSqliteMutation } from "@/repositories/nativeSqliteMutation";
import {
  migrateComponentShape,
  keepUnchangedComponentStamps,
  normalizeComponent,
} from "@/domain/componentRegistry";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

/**
 * Storage for the component registry.
 *
 * На вебе реестр лежит в той же базе, что и утечки, — своим набором данных под
 * собственным ключом записи, ровно как на устройстве, где он арендует
 * собственный ключ проекта у той же таблицы SQLite. Отдельной базы у него
 * больше нет, и это не про порядок в списке баз: в общей он получает ревизию,
 * контрольную сумму, зеркальную копию и журнал дельт — всё, что было построено
 * для утечек. Своей базой он лежал одной записью без единой из этих защит,
 * притом что инвентаризация месторождения теряется дороже, чем день утечек, а
 * восстановить её можно было только из последнего выгруженного архива.
 *
 * Прежний довод — «порча реестра не должна утянуть за собой утечки» — держался
 * на том, что порча в IndexedDB обычно уровня базы. Он никуда не делся, но
 * защищает от неё не соседство наборов, а вторая копия: зеркало живёт в
 * отдельной базе и открывается отдельным соединением. Теперь она есть и у
 * реестра, чего при отдельной базе как раз не было.
 *
 * Записи по-прежнему заменяют список целиком на уровне вызова, но до диска
 * доходит дельта: одна исправленная карточка — одна запись в журнале, а не
 * структурная копия всего обхода. Раньше так умело только устройство.
 */

const store = createWebDatasetStore(COMPONENT_DATASET);

/**
 * База, в которой реестр жил своей отдельной жизнью. Только на чтение и только
 * как источник переезда: проект, записанный прежней сборкой, должен открыться
 * и после обновления. Запись оттуда не удаляется — переезд, теряющий обход,
 * хуже лишней копии.
 */
const LEGACY_DB_NAME = "LeakTrackingComponentsDB";
const LEGACY_STORE_NAME = "components";
const LEGACY_DB_VERSION = 1;

const legacyStore = createIdbStore(
  LEGACY_DB_NAME,
  LEGACY_STORE_NAME,
  LEGACY_DB_VERSION,
);

/** Opened lazily on first use so a project without a registry pays nothing. */
let legacyOpened = false;

/** Waits for the legacy store to finish opening; resolves false if it never does. */
function whenLegacyReady(timeoutMs = 5_000) {
  if (!legacyOpened) {
    legacyStore.open();
    legacyOpened = true;
  }
  const { ready } = legacyStore.getState();
  if (ready) return Promise.resolve(true);
  // No IndexedDB at all — a locked-down browser, a private window — is an
  // answer, not something to wait out.
  if (typeof indexedDB === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);

    const unsubscribe = legacyStore.subscribe((_db, isReady) => {
      if (!isReady) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

export class ComponentDataError extends Error {
  /** @param {string} message @param {{cause?: any, code?: string}} [options] */
  constructor(message, { cause, code } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ComponentDataError";
    this.code = code ?? "COMPONENT_DATA_FAILED";
  }
}

/**
 * Старые ключи приводятся к нынешним на чтении — до того, как карточка попадёт
 * на экран, в выгрузку или в сведение. Одна точка на все пути чтения: экран
 * реестра, карта, шапка, книга, архив и импорт ходят сюда же.
 */
function migrateStored(components) {
  return Array.isArray(components)
    ? components.map(migrateComponentShape)
    : components;
}

/**
 * Конверт реестра, приехавший из прежней отдельной базы.
 *
 * Ревизии у него нет — normalizeWebEnvelope прочтёт её нулём, — и это ровно то,
 * что нужно: источник переезда обязан проигрывать любой записи, сделанной уже
 * в общей базе, чем бы ни кончился сам переезд.
 */
async function readLegacyRegistry(projectId) {
  if (!(await whenLegacyReady())) return null;
  try {
    const stored = await legacyStore.getStrict(projectId);
    if (stored == null) return null;
    return normalizeWebEnvelope(
      stored,
      `LeakTrackingComponentsDB[${projectId}]`,
    );
  } catch (error) {
    logger.warn("[components] прежняя база реестра не прочиталась:", error);
    return null;
  }
}

/**
 * Самая свежая из копий — и починка отставших.
 *
 * Та же дисциплина, что у утечек: копии упорядочиваются ревизией, побеждает
 * старшая, отставшие переписываются ею. Отличий два, и оба от бедности
 * истории. Копии, записанной до появления ревизий, у реестра быть не может —
 * ревизии он получил в тот же день, что и вторую копию, — поэтому нет и
 * неразрешимого расхождения двух долетописных копий. И запасного хранения в
 * localStorage у него никогда не было: реестр в него не поместился бы.
 *
 * Чинится только та копия, которая прочиталась. Ошибка чтения — это незнание,
 * а не устарелость, и переписать по ней копию неизвестной свежести значит
 * потерять то, что в ней лежало.
 */
async function readDurableRegistry(projectId) {
  let primary = null;
  let mirror = null;
  let primaryError = null;
  let mirrorError = null;

  try {
    primary = normalizeWebEnvelope(
      await store.read(projectId),
      `IndexedDB[${COMPONENT_DATASET}:${projectId}]`,
    );
  } catch (error) {
    primaryError = error;
    logger.error("[components] основная копия реестра не прочиталась:", error);
  }

  try {
    mirror = normalizeWebEnvelope(
      await store.readMirror(projectId),
      `IndexedDB-mirror[${COMPONENT_DATASET}:${projectId}]`,
    );
  } catch (error) {
    mirrorError = error;
    logger.error("[components] зеркало реестра испорчено:", error);
  }

  // Ни одной копии в общей базе — значит, проект либо реестра не вёл, либо
  // вёл его до переезда. Ответ на это лежит в прежней базе.
  const legacy =
    primary == null && mirror == null
      ? await readLegacyRegistry(projectId)
      : null;

  const available = [primary, mirror, legacy].filter(Boolean);
  if (available.length === 0) {
    if (primaryError || mirrorError) {
      throw new ComponentDataError("Реестр не прочитался ни из одной копии", {
        cause: primaryError ?? mirrorError,
        code: "COMPONENT_READ_FAILED",
      });
    }
    return [];
  }

  const selected = available.reduce((latest, candidate) =>
    compareWebEnvelopes(candidate, latest) > 0 ? candidate : latest,
  );

  if (!primaryError && !sameWebEnvelope(primary, selected)) {
    await store.write(projectId, selected).catch((error) => {
      logger.warn(
        "[components] основную копию реестра не удалось починить:",
        error,
      );
    });
  }
  if (!mirrorError && !sameWebEnvelope(mirror, selected)) {
    await store.writeMirror(projectId, selected).catch((error) => {
      logger.warn("[components] зеркало реестра не удалось починить:", error);
    });
  }

  return selected.deleted ? [] : selected.data;
}

/**
 * Пишет обе копии.
 *
 * Успехом считается хотя бы одна: зеркало на то и зеркало, чтобы запись
 * пережила отказ основной базы, — а обход, не записавшийся никуда, человек
 * узнает только дома.
 */
async function writeDurableRegistry(projectId, components, previous) {
  const [primaryRevision, mirrorRevision] = await Promise.all([
    store.readRevision(projectId),
    store.readMirrorRevision(projectId),
  ]);
  const envelope = createWebEnvelope(components, {
    previousRevisions: [primaryRevision, mirrorRevision],
  });
  // Та же дельта, что считает нативный путь. Одна исправленная карточка — одна
  // запись в журнале вместо структурной копии всего обхода.
  const mutation = Array.isArray(previous)
    ? createNativeSqliteMutation(previous, components)
    : null;

  const results = await Promise.allSettled([
    store.write(projectId, envelope, mutation),
    store.writeMirror(projectId, envelope, mutation),
  ]);
  const written = results.some(
    (result) => result.status === "fulfilled" && result.value === true,
  );
  if (!written) {
    const failure = results.find((result) => result.status === "rejected");
    throw new ComponentDataError("Failed to write the component registry", {
      cause: failure?.reason,
      code: "COMPONENT_WRITE_FAILED",
    });
  }
}

export const ComponentRepository = {
  /**
   * All components of a project, in stored order.
   * An absent registry reads as an empty list — that is the normal state
   * before anyone has walked anywhere.
   *
   * @param {{id: string, folderName?: string}} project
   * @returns {Promise<object[]>}
   */
  async load(project) {
    if (!project?.id) return [];

    try {
      if (isNative) {
        return migrateStored(
          await loadNativeComponents(project.folderName ?? project.id),
        );
      }
      return migrateStored(await readDurableRegistry(project.id));
    } catch (error) {
      if (error instanceof ComponentDataError) throw error;
      logger.error("[components] failed to read registry:", error);
      throw new ComponentDataError("Failed to read the component registry", {
        cause: error,
        code: "COMPONENT_READ_FAILED",
      });
    }
  },

  /**
   * Replaces the whole registry.
   *
   * Whole-list replacement at the call site: the caller hands over the walk as
   * it should look, and a failure leaves the previous one intact instead of
   * half of it. Что дойдёт до диска — снимок или дельта — решается ниже, по
   * `previous`.
   *
   * @param {{id: string, folderName?: string}} project
   * @param {object[]} components
   * @param {{numericKeys?: string[], now?: number, previous?: object[]|null}} [options]
   *   `previous` is what the caller believes is stored; given it, one edited
   *   card costs one record instead of the whole walk — on both platforms.
   * @returns {Promise<object[]>} the normalized list as stored
   */
  async save(
    project,
    components,
    /** @type {{numericKeys?: string[], now?: number, previous?: object[]|null}} */ {
      numericKeys = [],
      now,
      previous = null,
    } = {},
  ) {
    if (!project?.id) {
      throw new ComponentDataError("Project is required to save components", {
        code: "COMPONENT_PROJECT_REQUIRED",
      });
    }
    if (!Array.isArray(components)) {
      throw new ComponentDataError("Component list must be an array", {
        code: "COMPONENT_INVALID_PAYLOAD",
      });
    }

    // Метка изменения остаётся у тех карточек, которые не менялись: по ней
    // сведение реестров решает, чья версия свежее.
    const normalized = keepUnchangedComponentStamps(
      components.map((component) =>
        normalizeComponent(component, { numericKeys, now }),
      ),
      previous,
    );

    try {
      if (isNative) {
        await saveNativeComponents(
          project.folderName ?? project.id,
          normalized,
          {
            previous,
            envelope: {
              version: 1,
              updatedAt: typeof now === "number" ? now : Date.now(),
              data: normalized,
            },
          },
        );
        return normalized;
      }

      await writeDurableRegistry(project.id, normalized, previous);
      return normalized;
    } catch (error) {
      if (error instanceof ComponentDataError) throw error;
      logger.error("[components] failed to write registry:", error);
      throw new ComponentDataError("Failed to write the component registry", {
        cause: error,
        code: "COMPONENT_WRITE_FAILED",
      });
    }
  },

  /** Drops a project's registry. Used when the project itself is deleted. */
  async remove(project) {
    if (!project?.id) return false;

    try {
      if (isNative) {
        return await deleteNativeComponents(project.folderName ?? project.id);
      }
      const [primary, mirror] = await Promise.all([
        store.remove(project.id),
        store.deleteMirror(project.id),
      ]);
      // И запись в прежней базе: иначе проект, заведённый потом под тем же
      // идентификатором, поднял бы оттуда чужие карточки переездом.
      if (await whenLegacyReady()) await legacyStore.remove(project.id);
      return Boolean(primary || mirror);
    } catch (error) {
      logger.warn("[components] failed to delete registry:", error);
      return false;
    }
  },
};
