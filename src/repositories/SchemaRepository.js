import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { createIdbStore } from "@/repositories/idb";
import { ensureNativeDirectory } from "@/repositories/nativeDirectory";
import { isMissingNativeFileError } from "@/repositories/nativeFileErrors";
import {
  getNativeSchemaIndexPath,
  getNativeSchemaPath,
  getSchemaDir,
} from "@/repositories/schemaPaths";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import { base64ToBlob, blobToBase64 } from "@/utils/base64Blob";
import {
  liveSchemas,
  withSchemaAdded,
  withSchemaRemoved,
} from "@/domain/schemaTombstones";

/**
 * Storage for technological schema files.
 *
 * Two things live here: an index of what schemas a project has, and the file
 * bytes themselves. They are kept apart because the list screen only needs the
 * index — pulling a 20 MB drawing out of storage to render a row would make
 * opening the section as slow as opening the drawing.
 *
 * Files are *copied* in at pick time rather than referenced where the user
 * found them. A path into the device's Downloads folder stops resolving the
 * first time somebody clears it, and a drawing that vanishes mid-walk is worse
 * than the storage it costs to keep a copy.
 *
 * Deliberately not in the project data container: that one is read whole on
 * every start, and drawings in it would add seconds to the launch.
 */

const DB_NAME = "LeakTrackingSchemasDB";
const STORE_NAME = "schemas";
const DB_VERSION = 1;
const INDEX_VERSION = 1;

const store = createIdbStore(DB_NAME, STORE_NAME, DB_VERSION);

let opened = false;
function ensureOpen() {
  if (opened) return;
  store.open();
  opened = true;
}

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

const indexKey = (projectId) => `${projectId}:index`;
const fileKey = (projectId, schemaId) => `${projectId}:file:${schemaId}`;

function unwrapIndex(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

export class SchemaStorageError extends Error {
  /** @param {string} message @param {{cause?: any, code?: string}} [options] */
  constructor(message, { cause, code } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "SchemaStorageError";
    this.code = code ?? "SCHEMA_STORAGE_FAILED";
  }
}

async function assertReady() {
  if (await whenReady()) return;
  throw new SchemaStorageError("IndexedDB is unavailable", {
    code: "SCHEMA_STORE_UNAVAILABLE",
  });
}

function folderOf(project) {
  return project?.folderName ?? project?.id;
}

export const SchemaRepository = {
  /** Чертежи проекта. Никогда не байты — см. заметку наверху. */
  async listSchemas(project) {
    return liveSchemas(await this.readIndex(project));
  },

  /**
   * Весь список, вместе с надгробиями: они нужны выгрузке и сведению, а на
   * экран идут только живые чертежи.
   *
   * @param {{id: string, folderName?: string}} project
   * @returns {Promise<Record<string, any>[]>}
   */
  async readIndex(project) {
    if (!project?.id) return [];

    try {
      if (isNative) {
        try {
          const file = await Filesystem.readFile({
            path: getNativeSchemaIndexPath(folderOf(project)),
            directory: Directory.Data,
            encoding: Encoding.UTF8,
          });
          return unwrapIndex(JSON.parse(String(file.data)));
        } catch (error) {
          if (isMissingNativeFileError(error)) return [];
          throw error;
        }
      }

      await assertReady();
      return unwrapIndex(await store.getStrict(indexKey(project.id)));
    } catch (error) {
      if (error instanceof SchemaStorageError) throw error;
      logger.error("[schemas] failed to read the index:", error);
      throw new SchemaStorageError("Failed to read the schema list", {
        cause: error,
        code: "SCHEMA_INDEX_READ_FAILED",
      });
    }
  },

  /**
   * @param {{id: string, folderName?: string}} project
   * @param {Record<string, any>[]} schemas
   * @param {{now?: number}} [options]
   */
  async saveIndex(project, schemas, { now } = {}) {
    const envelope = {
      version: INDEX_VERSION,
      updatedAt: typeof now === "number" ? now : Date.now(),
      data: schemas,
    };

    if (isNative) {
      const path = getNativeSchemaIndexPath(folderOf(project));
      await ensureNativeDirectory(
        getSchemaDir(folderOf(project)),
        Directory.Data,
      );
      await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        data: JSON.stringify(envelope),
      });
      return schemas;
    }

    await assertReady();
    const written = await store.save(indexKey(project.id), envelope);
    if (!written) {
      throw new SchemaStorageError("Failed to write the schema list", {
        code: "SCHEMA_INDEX_WRITE_FAILED",
      });
    }
    return schemas;
  },

  /**
   * Copies a picked file into app storage and adds it to the index.
   *
   * The index is written last on purpose: an index entry pointing at bytes
   * that were never stored shows the operator a drawing that cannot open,
   * while bytes without an entry are merely wasted space that the next save
   * can reclaim.
   *
   * @param {{id: string, folderName?: string}} project
   * @param {Record<string, any>} schema index entry from createSchemaEntry
   * @param {Blob} blob the picked file
   */
  async addSchema(project, schema, blob) {
    if (!project?.id) {
      throw new SchemaStorageError("Project is required to store a schema", {
        code: "SCHEMA_PROJECT_REQUIRED",
      });
    }

    try {
      if (isNative) {
        await ensureNativeDirectory(
          getSchemaDir(folderOf(project)),
          Directory.Data,
        );
        await Filesystem.writeFile({
          path: getNativeSchemaPath(folderOf(project), schema),
          directory: Directory.Data,
          data: await blobToBase64(blob),
        });
      } else {
        await assertReady();
        // Stored as a Blob rather than a data URL: base64 would add a third
        // to every drawing, and these are the largest files the app holds.
        const written = await store.save(fileKey(project.id, schema.id), blob);
        if (!written) {
          throw new SchemaStorageError("Failed to store the schema file", {
            code: "SCHEMA_FILE_WRITE_FAILED",
          });
        }
      }

      // Из всего списка: иначе добавление стирало бы надгробия.
      const schemas = await this.readIndex(project);
      await this.saveIndex(project, withSchemaAdded(schemas, schema));
      return schema;
    } catch (error) {
      if (error instanceof SchemaStorageError) throw error;
      logger.error("[schemas] failed to store a schema:", error);
      throw new SchemaStorageError("Failed to store the schema", {
        cause: error,
        code: "SCHEMA_FILE_WRITE_FAILED",
      });
    }
  },

  /**
   * The file bytes, as a Blob ready for an object URL.
   * @returns {Promise<Blob|null>} null when the file is gone
   */
  async readSchemaFile(project, schema) {
    if (!project?.id || !schema?.id) return null;

    try {
      if (isNative) {
        const file = await Filesystem.readFile({
          path: getNativeSchemaPath(folderOf(project), schema),
          directory: Directory.Data,
        });
        return base64ToBlob(String(file.data), schema.type);
      }

      await assertReady();
      const stored = await store.getStrict(fileKey(project.id, schema.id));
      if (!stored) return null;
      return stored instanceof Blob
        ? stored
        : new Blob([stored], {
            type: schema.type,
          });
    } catch (error) {
      if (isMissingNativeFileError(error)) return null;
      logger.error("[schemas] failed to read a schema file:", error);
      throw new SchemaStorageError("Failed to open the schema", {
        cause: error,
        code: "SCHEMA_FILE_READ_FAILED",
      });
    }
  },

  /**
   * Removes every drawing a project holds, index included.
   *
   * On a device the files live inside the project folder and go with it. In the
   * browser they sit in a store of their own, keyed by project id, and used to
   * outlive the project that owned them — a new project taking the same id
   * would inherit drawings nobody put there.
   */
  async removeProjectSchemas(project) {
    if (!project?.id) return false;
    if (isNative) return true;

    try {
      await assertReady();
      const schemas = await this.listSchemas(project);
      for (const schema of schemas) {
        await store.remove(fileKey(project.id, schema.id));
      }
      await store.remove(indexKey(project.id));
      return true;
    } catch (error) {
      logger.warn("[schemas] failed to delete the project drawings:", error);
      return false;
    }
  },

  /** Removes one schema, bytes and index entry together. */
  async removeSchema(project, schema) {
    if (!project?.id || !schema?.id) return false;

    try {
      if (isNative) {
        await Filesystem.deleteFile({
          path: getNativeSchemaPath(folderOf(project), schema),
          directory: Directory.Data,
        }).catch((error) => {
          if (!isMissingNativeFileError(error)) throw error;
        });
      } else {
        await assertReady();
        await store.remove(fileKey(project.id, schema.id));
      }

      // Запись остаётся надгробием: без него второй телефон вернёт схему при
      // первом же обмене — для него она просто есть.
      const schemas = await this.readIndex(project);
      await this.saveIndex(project, withSchemaRemoved(schemas, schema.id));
      return true;
    } catch (error) {
      logger.warn("[schemas] failed to delete a schema:", error);
      return false;
    }
  },
};
