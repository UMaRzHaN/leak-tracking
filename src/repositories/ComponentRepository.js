import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { createIdbStore } from "@/repositories/idb";
import { ensureNativeDirectory } from "@/repositories/nativeDirectory";
import { isMissingNativeFileError } from "@/repositories/legacyNativeLeakStorage";
import { normalizeComponent } from "@/domain/componentRegistry";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

/**
 * Storage for the component registry.
 *
 * Kept apart from LeakRepository on purpose. That one carries revisions, a
 * mirror copy, a write journal and a merge engine, because a leak record is
 * edited repeatedly by several people and losing one is losing evidence. The
 * registry is a flat list written once during the walk and read afterwards, so
 * it gets the same *shape* — one envelope per project, atomic replace — without
 * the machinery.
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

function getNativePath(folderName) {
  return `LeakReports/${folderName}/data/components.json`;
}

function makeEnvelope(components, now) {
  return {
    version: ENVELOPE_VERSION,
    updatedAt: typeof now === "number" ? now : Date.now(),
    data: components,
  };
}

/**
 * Reads the array out of an envelope, tolerating both the current shape and a
 * bare array — a file hand-edited or restored from an older build should not
 * read as an empty registry, because "empty" is indistinguishable from "walk
 * not started" and would quietly invite someone to redo it.
 */
function unwrapEnvelope(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

async function loadNative(folderName) {
  try {
    const file = await Filesystem.readFile({
      path: getNativePath(folderName),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return unwrapEnvelope(JSON.parse(String(file.data)));
  } catch (error) {
    if (isMissingNativeFileError(error)) return [];
    throw error;
  }
}

async function saveNative(folderName, envelope) {
  const path = getNativePath(folderName);
  await ensureNativeDirectory(
    path.substring(0, path.lastIndexOf("/")),
    Directory.Data,
  );
  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(envelope),
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
      if (isNative) return await loadNative(project.folderName ?? project.id);

      if (!(await whenReady())) {
        throw new ComponentDataError("IndexedDB is unavailable", {
          code: "COMPONENT_STORE_UNAVAILABLE",
        });
      }
      return unwrapEnvelope(await store.getStrict(project.id));
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
   * @param {{numericKeys?: string[], now?: number}} [options]
   * @returns {Promise<object[]>} the normalized list as stored
   */
  async save(
    project,
    components,
    /** @type {{numericKeys?: string[], now?: number}} */ {
      numericKeys = [],
      now,
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
        await saveNative(project.folderName ?? project.id, envelope);
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
        await Filesystem.deleteFile({
          path: getNativePath(project.folderName ?? project.id),
          directory: Directory.Data,
        });
        return true;
      }
      if (!(await whenReady())) return false;
      return await store.remove(project.id);
    } catch (error) {
      if (isMissingNativeFileError(error)) return true;
      logger.warn("[components] failed to delete registry:", error);
      return false;
    }
  },
};
