import { createIdbStore } from "@/repositories/idb";
import {
  deleteNativeComponents,
  loadNativeComponents,
  saveNativeComponents,
  unwrapEnvelope,
} from "@/repositories/nativeComponentStorage";
import {
  migrateComponentShape,
  normalizeComponent,
} from "@/domain/componentRegistry";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

/**
 * Storage for the component registry.
 *
 * Kept apart from LeakRepository on purpose. That one carries revisions, a
 * mirror copy, a write journal and a merge engine, because a leak record is
 * edited repeatedly by several people and losing one is losing evidence. The
 * registry is written card by card during a walk and read afterwards, so it
 * gets the same *shape* — one dataset per project, atomic writes — without the
 * machinery.
 *
 * On a device it lives in the same SQLite store as the leaks, under a project
 * key of its own: a finished field is thousands of components, and the JSON
 * file it used to be was rewritten whole every time one card changed. See
 * nativeComponentStorage.
 *
 * Web copies live in their own IndexedDB database rather than the leak one: an
 * IndexedDB failure is usually database-wide, and a corrupt registry must not
 * be able to take the leak data down with it.
 */

const DB_NAME = "LeakTrackingComponentsDB";
const STORE_NAME = "components";
const DB_VERSION = 1;
const ENVELOPE_VERSION = 1;

const store = createIdbStore(DB_NAME, STORE_NAME, DB_VERSION);

/** Opened lazily on first use so a project without a registry pays nothing. */
let opened = false;
function ensureOpen() {
  if (opened) return;
  store.open();
  opened = true;
}

/** Waits for the store to finish opening; resolves false if it never does. */
function whenReady(timeoutMs = 5_000) {
  ensureOpen();
  const { ready } = store.getState();
  if (ready) return Promise.resolve(true);
  // No IndexedDB at all — a locked-down browser, a private window — is an
  // answer, not something to wait out. The store can never open, and the full
  // timeout used to be spent before reporting what was already known.
  if (typeof indexedDB === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);

    const unsubscribe = store.subscribe((_db, isReady) => {
      if (!isReady) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

function makeEnvelope(components, now) {
  return {
    version: ENVELOPE_VERSION,
    updatedAt: typeof now === "number" ? now : Date.now(),
    data: components,
  };
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

      if (!(await whenReady())) {
        throw new ComponentDataError("IndexedDB is unavailable", {
          code: "COMPONENT_STORE_UNAVAILABLE",
        });
      }
      return migrateStored(unwrapEnvelope(await store.getStrict(project.id)));
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
   * Whole-list replacement rather than per-record writes: the list is small
   * enough that a partial write buys nothing, and an atomic swap means a
   * failure leaves the previous walk intact instead of half of it.
   *
   * @param {{id: string, folderName?: string}} project
   * @param {object[]} components
   * @param {{numericKeys?: string[], now?: number, previous?: object[]|null}} [options]
   *   `previous` is what the caller believes is stored; given it, one edited
   *   card costs one row on a device instead of the whole walk.
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

    const normalized = components.map((component) =>
      normalizeComponent(component, { numericKeys, now }),
    );
    const envelope = makeEnvelope(normalized, now);

    try {
      if (isNative) {
        await saveNativeComponents(
          project.folderName ?? project.id,
          normalized,
          { previous, envelope },
        );
        return normalized;
      }

      if (!(await whenReady())) {
        throw new ComponentDataError("IndexedDB is unavailable", {
          code: "COMPONENT_STORE_UNAVAILABLE",
        });
      }
      const written = await store.save(project.id, envelope);
      if (!written) {
        throw new ComponentDataError("Failed to write the component registry", {
          code: "COMPONENT_WRITE_FAILED",
        });
      }
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
      if (!(await whenReady())) return false;
      return await store.remove(project.id);
    } catch (error) {
      logger.warn("[components] failed to delete registry:", error);
      return false;
    }
  },
};
