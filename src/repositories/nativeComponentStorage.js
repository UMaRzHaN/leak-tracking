import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { isMissingNativeFileError } from "@/repositories/nativeFileErrors";
import { ensureNativeDirectory } from "@/repositories/nativeDirectory";
import {
  createNativeSqliteMutation,
  shouldReplaceNativeSqliteDataset,
} from "@/repositories/nativeSqliteMutation";
import {
  NativeLeakStorage,
  isSqlitePluginUnavailable,
} from "@/repositories/nativeSqlitePlugin";
import { logger } from "@/utils/logger";

/**
 * The component registry on a device, in the same SQLite store as the leaks.
 *
 * It started as one JSON file rewritten whole on every save. That is fine for
 * twenty cards and wrong for a finished walk: a field is thousands of
 * components, and rewriting the whole file to change one meant the write time
 * grew with the registry, on the cheapest phone, outdoors, with the walk still
 * going. A killed process mid-write took the file with it.
 *
 * The store is the leaks' one because it was never about leaks: its table
 * holds records keyed by a project key and an id, and never looks inside the
 * payload. The registry rents a project key of its own — `components:<folder>`
 * — which keeps the two datasets in one transactional file that cannot
 * collide, and gives the registry per-record upserts and deletes for free.
 *
 * The JSON file stays as the fallback for builds without the plugin, and as
 * what an already-walked project is read out of once, on the way in.
 */

const KEY_PREFIX = "components:";

function projectKeyOf(folderName) {
  return `${KEY_PREFIX}${folderName}`;
}

function getJsonPath(folderName) {
  return `LeakReports/${folderName}/data/components.json`;
}

let pluginUnavailable = false;
let fallbackWarningLogged = false;

/**
 * Calls the store, or answers null when there is no store to call.
 *
 * Null is "ask the JSON file instead", never "the registry is empty" — those
 * two are indistinguishable to a walker and one of them invites redoing a day
 * of work.
 */
async function invoke(method, payload) {
  if (pluginUnavailable) return null;
  try {
    return await NativeLeakStorage[method](payload);
  } catch (error) {
    if (!isSqlitePluginUnavailable(error)) throw error;
    pluginUnavailable = true;
    if (!fallbackWarningLogged) {
      fallbackWarningLogged = true;
      logger.warn(
        "[components] SQLite is unavailable; the registry falls back to its JSON file.",
        error,
      );
    }
    return null;
  }
}

function parseRecords(value) {
  if (value == null || value === "") return [];
  const parsed = JSON.parse(String(value));
  if (!Array.isArray(parsed)) {
    throw new TypeError("Native SQLite component records must be an array");
  }
  return parsed;
}

/** The array out of an envelope, tolerating the bare array older builds wrote. */
export function unwrapEnvelope(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

async function readJsonFile(folderName) {
  try {
    const file = await Filesystem.readFile({
      path: getJsonPath(folderName),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return unwrapEnvelope(JSON.parse(String(file.data)));
  } catch (error) {
    if (isMissingNativeFileError(error)) return null;
    throw error;
  }
}

async function writeJsonFile(folderName, envelope) {
  const path = getJsonPath(folderName);
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

async function replaceAll(folderName, components) {
  const result = await invoke("replaceAll", {
    projectKey: projectKeyOf(folderName),
    recordsJson: JSON.stringify(components),
    syncStateJson: null,
  });
  return result !== null;
}

/**
 * The registry as stored, migrating a project that predates the store.
 *
 * @param {string} folderName
 * @returns {Promise<object[]>}
 */
export async function loadNativeComponents(folderName) {
  const result = await invoke("load", {
    projectKey: projectKeyOf(folderName),
  });

  if (result === null) return (await readJsonFile(folderName)) ?? [];
  if (result.found) return parseRecords(result.recordsJson);

  // Nothing in the store yet: either a project that has never had a registry,
  // or one walked before this existed. The file answers which, and if it holds
  // a walk it is moved in — once, and without being deleted, because a
  // migration that loses a walk is worse than a duplicate copy of one.
  const fromFile = await readJsonFile(folderName);
  if (!fromFile?.length) return [];

  if (await replaceAll(folderName, fromFile)) {
    logger.warn(
      `[components] Registry of "${folderName}" moved from its JSON file into SQLite; the file is kept as a recovery copy.`,
    );
  }
  return fromFile;
}

/**
 * Writes the registry.
 *
 * `previous` is what the caller believes is stored. Given it, one edited card
 * is one row written instead of the whole walk — the same trade the leak
 * storage makes, and for the same reason. Without it, or when the change is
 * broad enough that per-row work stops paying, the dataset is replaced whole.
 *
 * @param {string} folderName
 * @param {object[]} components
 * @param {{previous?: object[]|null, envelope?: object}} [options]
 */
export async function saveNativeComponents(
  folderName,
  components,
  { previous = null, envelope = null } = {},
) {
  const mutation = Array.isArray(previous)
    ? createNativeSqliteMutation(previous, components)
    : null;

  if (!shouldReplaceNativeSqliteDataset(mutation, components.length)) {
    const result = await invoke("applyChanges", {
      projectKey: projectKeyOf(folderName),
      upsertsJson: JSON.stringify(mutation.upserts),
      deletedIdsJson: JSON.stringify(mutation.deletedIds),
      syncStateJson: null,
    });
    // A project the store has never seen cannot take a diff; it takes the
    // whole list below.
    if (result !== null && !result.projectMissing) return;
  }

  if (await replaceAll(folderName, components)) return;

  await writeJsonFile(
    folderName,
    envelope ?? { version: 1, updatedAt: Date.now(), data: components },
  );
}

/** Drops the registry. Used when the project itself is deleted. */
export async function deleteNativeComponents(folderName) {
  await invoke("deleteProject", { projectKey: projectKeyOf(folderName) });

  try {
    await Filesystem.deleteFile({
      path: getJsonPath(folderName),
      directory: Directory.Data,
    });
  } catch (error) {
    if (!isMissingNativeFileError(error)) throw error;
  }
  return true;
}

export function resetNativeComponentStorageForTests() {
  pluginUnavailable = false;
  fallbackWarningLogged = false;
}
