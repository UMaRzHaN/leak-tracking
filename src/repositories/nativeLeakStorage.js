import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { logger } from "@/utils/logger";
import {
  clearNativeProjectStorageCache as clearLegacyCache,
  getNativeProjectPaths,
  loadNativeProject as loadLegacyNativeProject,
  readNativeSnapshot,
  saveNativeProject as saveLegacyNativeProject,
  writeNativeProjectSnapshot as writeLegacyNativeProjectSnapshot,
} from "@/repositories/legacyNativeLeakStorage";
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

let sqliteUnavailable = false;
let fallbackWarningLogged = false;
const sqliteMarkers = new Set();

function getSqliteMarkerPath(folderName) {
  return `LeakReports/${folderName}/data/data.sqlite.json`;
}

async function hasSqliteMarker(folderName) {
  if (sqliteMarkers.has(folderName)) return true;
  try {
    await Filesystem.stat({
      path: getSqliteMarkerPath(folderName),
      directory: Directory.Data,
    });
    sqliteMarkers.add(folderName);
    return true;
  } catch (error) {
    if (isMissingNativeFileError(error)) return false;
    throw error;
  }
}

async function writeSqliteMarker(folderName) {
  if (await hasSqliteMarker(folderName)) return;
  const path = getSqliteMarkerPath(folderName);
  const directory = path.substring(0, path.lastIndexOf("/"));
  try {
    await ensureNativeDirectory(directory, Directory.Data);
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify({ version: 1, engine: "sqlite" }),
    });
    sqliteMarkers.add(folderName);
  } catch (error) {
    logger.warn(
      `[nativeLeakStorage] Could not persist the SQLite migration marker for "${folderName}".`,
      error,
    );
    throw Object.assign(
      new Error(
        `Could not persist the SQLite migration marker for "${folderName}".`,
        { cause: error },
      ),
      { code: "SQLITE_MARKER_WRITE_FAILED" },
    );
  }
}

async function assertLegacyFallbackAllowed(folderName, cause) {
  if (!folderName || !(await hasSqliteMarker(folderName))) return;
  throw Object.assign(
    new Error(
      `Native SQLite storage is unavailable for migrated project "${folderName}"; refusing to load a stale JSON recovery copy.`,
      { cause },
    ),
    { code: "SQLITE_STORAGE_UNAVAILABLE" },
  );
}

function noteLegacyFallback(error) {
  sqliteUnavailable = true;
  if (fallbackWarningLogged) return;
  fallbackWarningLogged = true;
  logger.warn(
    "[nativeLeakStorage] Native SQLite plugin is unavailable; using the legacy snapshot/journal storage for compatibility.",
    error,
  );
}

async function invokeSqlite(method, payload) {
  if (sqliteUnavailable) {
    await assertLegacyFallbackAllowed(payload?.projectKey, null);
    return null;
  }
  try {
    return await NativeLeakStorage[method](payload);
  } catch (error) {
    if (isSqlitePluginUnavailable(error)) {
      await assertLegacyFallbackAllowed(payload?.projectKey, error);
      noteLegacyFallback(error);
      return null;
    }
    throw error;
  }
}

function parseJson(value, fallback, label) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new TypeError(`Invalid JSON returned by native SQLite for ${label}`, {
      cause: error,
    });
  }
}

function normalizeSqliteLoad(result, folderName) {
  if (!result?.found) return null;
  const data = parseJson(result.recordsJson, [], "records");
  if (!Array.isArray(data)) {
    throw new TypeError("Native SQLite records must be an array");
  }
  return {
    state: {
      data,
      syncState: parseJson(result.syncStateJson, null, "sync state"),
      snapshotVersion: 4,
      snapshotId: null,
      entryCount: 0,
      byteLength: Number(result.databaseBytes ?? 0),
      truncatedTail: false,
      staleEntries: false,
    },
    source: `sqlite:${folderName}`,
    recovered: false,
  };
}

async function replaceSqliteProject(folderName, leaks, syncState) {
  const result = await invokeSqlite("replaceAll", {
    projectKey: folderName,
    recordsJson: JSON.stringify(leaks),
    syncStateJson: syncState == null ? null : JSON.stringify(syncState),
  });
  if (result !== null) await writeSqliteMarker(folderName);
  return result !== null;
}

export function clearNativeProjectStorageCache(folderName) {
  clearLegacyCache(folderName);
}

export { getNativeProjectPaths, readNativeSnapshot };

export async function loadNativeProject(folderName) {
  const sqliteResult = await invokeSqlite("load", { projectKey: folderName });
  if (sqliteResult !== null) {
    const loaded = normalizeSqliteLoad(sqliteResult, folderName);
    if (loaded) {
      await writeSqliteMarker(folderName);
      return loaded;
    }

    const legacy = await loadLegacyNativeProject(folderName);
    if (!legacy) return null;

    await replaceSqliteProject(
      folderName,
      legacy.state.data,
      legacy.state.syncState,
    );
    logger.warn(
      `[nativeLeakStorage] Migrated project "${folderName}" from snapshot/journal storage to SQLite without deleting the recovery files.`,
    );
    return {
      ...legacy,
      source: `sqlite:${folderName}:migrated-from:${legacy.source}`,
      recovered: legacy.recovered,
    };
  }

  return loadLegacyNativeProject(folderName);
}

/**
 * Additive, currently-unwired paged read of a native SQLite project (see
 * LeakDatabaseStore#loadProjectPage on the Android side). Nothing in the app
 * calls this yet — LeakRepository.getAll() / loadNativeProject() above still
 * load the whole project in one call, and every page/hook that consumes
 * leaks (Settings, Monitoring, MainPage, search, ...) still assumes it has
 * the full array. Wiring real pagination through those call sites — moving
 * from a whole-array project to record-level reads — is a separate, larger
 * change.
 * This function exists so that work can start from a tested, working
 * native primitive instead of from scratch, without touching any existing
 * behavior.
 *
 * Returns null when the SQLite engine is unavailable (e.g. a project still
 * on legacy JSON snapshot storage) — paging only exists for SQLite-backed
 * projects, so callers must be prepared to fall back to the full read.
 */
export async function loadNativeProjectPage(
  folderName,
  { offset = 0, limit = 500 } = {},
) {
  const result = await invokeSqlite("loadPage", {
    projectKey: folderName,
    offset,
    limit,
  });
  if (result === null || !result.found) return null;
  const data = parseJson(result.recordsJson, [], "page records");
  if (!Array.isArray(data)) {
    throw new TypeError("Native SQLite page records must be an array");
  }
  return {
    leaks: data,
    totalCount: Number(result.totalCount ?? data.length),
    offset: Number(result.offset ?? offset),
    limit: Number(result.limit ?? limit),
    hasMore: Boolean(result.hasMore),
    updatedAt: Number(result.updatedAt ?? 0),
  };
}

export async function saveNativeProject(
  folderName,
  leaks,
  { syncState = null, previousLeaks = null, forceSnapshot = false } = {},
) {
  if (!Array.isArray(leaks)) {
    throw new TypeError("Native project data must be an array");
  }

  const mutation = Array.isArray(previousLeaks)
    ? createNativeSqliteMutation(previousLeaks, leaks)
    : null;
  const replaceAll =
    forceSnapshot ||
    mutation == null ||
    shouldReplaceNativeSqliteDataset(mutation, leaks.length);

  if (replaceAll) {
    const written = await replaceSqliteProject(folderName, leaks, syncState);
    if (written) return;
  } else {
    const result = await invokeSqlite("applyChanges", {
      projectKey: folderName,
      upsertsJson: JSON.stringify(mutation.upserts),
      deletedIdsJson: JSON.stringify(mutation.deletedIds),
      syncStateJson: syncState == null ? null : JSON.stringify(syncState),
    });
    if (result?.projectMissing) {
      const written = await replaceSqliteProject(folderName, leaks, syncState);
      if (written) return;
    } else if (result !== null) {
      await writeSqliteMarker(folderName);
      return;
    }
  }

  await saveLegacyNativeProject(folderName, leaks, {
    syncState,
    previousLeaks,
    forceSnapshot,
  });
}

export async function writeNativeProjectSnapshot(
  folderName,
  leaks,
  syncState = null,
) {
  if (await replaceSqliteProject(folderName, leaks, syncState)) return;
  await writeLegacyNativeProjectSnapshot(folderName, leaks, syncState);
}

export async function getNativeStorageDiagnostics(folderName) {
  const result = await invokeSqlite("diagnostics", {
    projectKey: folderName,
  });
  if (result !== null) return { engine: "sqlite", ...result };

  const paths = getNativeProjectPaths(folderName);
  return {
    engine: "legacy-json",
    paths,
  };
}

export async function deleteNativeProjectStorage(folderName) {
  const result = await invokeSqlite("deleteProject", {
    projectKey: folderName,
  });
  clearLegacyCache(folderName);
  if (result === null) return false;

  await Filesystem.deleteFile({
    path: getSqliteMarkerPath(folderName),
    directory: Directory.Data,
  }).catch((error) => {
    if (!isMissingNativeFileError(error)) {
      logger.warn(
        `[nativeLeakStorage] Could not remove the SQLite marker for "${folderName}".`,
        error,
      );
    }
  });
  sqliteMarkers.delete(folderName);
  return true;
}

export function resetNativeStorageStrategyForTests() {
  sqliteUnavailable = false;
  fallbackWarningLogged = false;
  sqliteMarkers.clear();
  clearLegacyCache();
}
