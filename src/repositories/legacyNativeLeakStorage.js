import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { logger } from "@/utils/logger";
import { ignoredError } from "@/utils/ignoredError";
import { isMissingNativeFileError } from "@/repositories/nativeFileErrors";
import { globalScope } from "@/utils/globalScope";

const JOURNAL_VERSION = 1;
const JOURNAL_MAX_ENTRIES = 40;
const JOURNAL_MAX_BYTES = 1024 * 1024;
const JOURNAL_MAX_ENTRY_BYTES = 512 * 1024;
const JOURNAL_MAX_CHANGED_RECORDS = 250;
const cache = new Map();

export function clearNativeProjectStorageCache(folderName) {
  if (typeof folderName === "string" && folderName) {
    cache.delete(folderName);
    return;
  }
  cache.clear();
}

export function getNativeProjectPaths(folderName) {
  const dir = `LeakReports/${folderName}/data`;
  return {
    main: `${dir}/data.json`,
    backup: `${dir}/data.backup.json`,
    temp: `${dir}/data.tmp.json`,
    rollback: `${dir}/data.rollback.json`,
    backupTemp: `${dir}/data.backup.tmp.json`,
    journal: `${dir}/data.journal.jsonl`,
    meta: `${dir}/data.storage.json`,
  };
}

function normalizeSnapshot(value, path) {
  if (Array.isArray(value)) {
    return {
      data: value,
      syncState: null,
      snapshotVersion: 0,
      snapshotId: null,
    };
  }
  if (
    value &&
    typeof value === "object" &&
    (value.version === 2 || value.version === 3) &&
    Array.isArray(value.data)
  ) {
    return {
      data: value.data,
      syncState: value.syncState ?? null,
      snapshotVersion: value.version,
      snapshotId:
        value.version === 3 && typeof value.snapshotId === "string"
          ? value.snapshotId
          : null,
    };
  }
  throw new TypeError(`Expected project data in ${path}`);
}

export async function readNativeSnapshot(path, directory = Directory.Data) {
  const result = await Filesystem.readFile({
    path,
    directory,
    encoding: Encoding.UTF8,
  });
  return normalizeSnapshot(JSON.parse(String(result.data || "[]")), path);
}

async function ensureDir(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await Filesystem.mkdir({
    path: dir,
    directory: Directory.Data,
    recursive: true,
  }).catch(ignoredError("legacyNativeStorage.removeDirectory"));
}

async function deleteIfExists(path) {
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(
    (error) => {
      if (!isMissingNativeFileError(error)) throw error;
    },
  );
}

async function fileExists(path) {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch (error) {
    if (isMissingNativeFileError(error)) return false;
    throw error;
  }
}

function utf8Length(value) {
  return new TextEncoder().encode(value).byteLength;
}

function indexRecords(records) {
  if (!Array.isArray(records)) return null;
  const map = new Map();
  const order = [];
  for (const record of records) {
    if (
      !record ||
      typeof record !== "object" ||
      !(typeof record.id === "string" || typeof record.id === "number")
    ) {
      return null;
    }
    const key = String(record.id);
    if (map.has(key)) return null;
    map.set(key, record);
    order.push(key);
  }
  return { map, order };
}

function recordsEqual(left, right) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function createMutation(previous, next, syncState, snapshotId) {
  const previousIndex = indexRecords(previous);
  const nextIndex = indexRecords(next);
  if (!previousIndex || !nextIndex) return null;

  const deletedIds = previousIndex.order.filter((id) => !nextIndex.map.has(id));
  const expectedOrder = [
    ...previousIndex.order.filter((id) => nextIndex.map.has(id)),
    ...nextIndex.order.filter((id) => !previousIndex.map.has(id)),
  ];
  if (
    expectedOrder.length !== nextIndex.order.length ||
    expectedOrder.some((id, index) => id !== nextIndex.order[index])
  ) {
    return null;
  }

  const upserts = [];
  for (const id of nextIndex.order) {
    const nextRecord = nextIndex.map.get(id);
    const previousRecord = previousIndex.map.get(id);
    if (!previousRecord || !recordsEqual(previousRecord, nextRecord)) {
      upserts.push(nextRecord);
    }
  }

  return {
    version: JOURNAL_VERSION,
    snapshotId,
    upserts,
    deletedIds,
    syncState: syncState ?? null,
  };
}

function validateMutation(entry, path) {
  if (
    !entry ||
    typeof entry !== "object" ||
    entry.version !== JOURNAL_VERSION ||
    typeof entry.snapshotId !== "string" ||
    !entry.snapshotId ||
    !Array.isArray(entry.upserts) ||
    !Array.isArray(entry.deletedIds)
  ) {
    throw new TypeError(`Invalid native project journal entry in ${path}`);
  }
  if (!indexRecords(entry.upserts)) {
    throw new TypeError(`Invalid native project journal upserts in ${path}`);
  }
  return entry;
}

function applyMutation(records, entry, path) {
  const indexed = indexRecords(records);
  if (!indexed) {
    throw new TypeError(`Cannot apply native journal to ${path}`);
  }
  const { map, order } = indexed;
  for (const rawId of entry.deletedIds) {
    map.delete(String(rawId));
  }
  for (const record of entry.upserts) {
    const id = String(record.id);
    if (!map.has(id)) order.push(id);
    map.set(id, record);
  }
  return order.filter((id) => map.has(id)).map((id) => map.get(id));
}

async function readJournal(path, state) {
  let raw;
  try {
    raw = String(
      (
        await Filesystem.readFile({
          path,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        })
      ).data || "",
    );
  } catch (error) {
    if (isMissingNativeFileError(error)) {
      return {
        ...state,
        entryCount: 0,
        byteLength: 0,
        truncatedTail: false,
        staleEntries: false,
      };
    }
    throw error;
  }

  const lines = raw.split("\n");
  let data = state.data;
  let syncState = state.syncState;
  let entryCount = 0;
  let truncatedTail = false;
  let staleEntries = false;
  let lastNonEmpty = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim()) {
      lastNonEmpty = index;
      break;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      if (index === lastNonEmpty && !raw.endsWith("\n")) {
        truncatedTail = true;
        logger.warn(
          `[nativeLeakStorage] Ignored incomplete final journal entry in "${path}".`,
          error,
        );
        break;
      }
      throw error;
    }
    const entry = validateMutation(parsed, path);
    if (entry.snapshotId !== state.snapshotId) {
      staleEntries = true;
      continue;
    }
    data = applyMutation(data, entry, path);
    syncState = entry.syncState ?? null;
    entryCount += 1;
  }

  return {
    data,
    syncState,
    snapshotVersion: state.snapshotVersion,
    snapshotId: state.snapshotId,
    entryCount,
    byteLength: utf8Length(raw),
    truncatedTail,
    staleEntries,
  };
}

async function readBaselineSnapshotId(paths) {
  try {
    const result = await Filesystem.readFile({
      path: paths.meta,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    const parsed = JSON.parse(String(result.data || "{}"));
    return typeof parsed.snapshotId === "string" ? parsed.snapshotId : null;
  } catch (error) {
    if (!isMissingNativeFileError(error) && !(error instanceof SyntaxError)) {
      logger.warn(
        `[nativeLeakStorage] Could not read storage metadata from "${paths.meta}".`,
        error,
      );
    }
    return null;
  }
}

async function writeBaselineSnapshotId(paths, snapshotId) {
  await Filesystem.writeFile({
    path: paths.meta,
    directory: Directory.Data,
    data: JSON.stringify({ version: 1, snapshotId }),
    encoding: Encoding.UTF8,
  });
}

async function replaceBackupFromMain(paths) {
  await deleteIfExists(paths.backupTemp);
  await Filesystem.copy({
    from: paths.main,
    to: paths.backupTemp,
    directory: Directory.Data,
  });
  await deleteIfExists(paths.backup);
  try {
    await Filesystem.rename({
      from: paths.backupTemp,
      to: paths.backup,
      directory: Directory.Data,
    });
  } catch (error) {
    await Filesystem.copy({
      from: paths.backupTemp,
      to: paths.backup,
      directory: Directory.Data,
    });
    await deleteIfExists(paths.backupTemp);
    logger.warn(
      "[nativeLeakStorage] Backup rename failed; used native copy fallback.",
      error,
    );
  }
}

async function restoreMainFromRollback(paths, hasPrevious) {
  await deleteIfExists(paths.main);
  if (hasPrevious) {
    await Filesystem.copy({
      from: paths.rollback,
      to: paths.main,
      directory: Directory.Data,
    });
  }
}

function createSnapshotId() {
  return (
    globalScope.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

async function writeSnapshot(folderName, leaks, syncState = null) {
  const paths = getNativeProjectPaths(folderName);
  const snapshotId = createSnapshotId();
  const serialized = JSON.stringify({
    version: 3,
    snapshotId,
    data: leaks,
    syncState: syncState ?? null,
  });
  await ensureDir(paths.temp);
  await Filesystem.writeFile({
    path: paths.temp,
    directory: Directory.Data,
    data: serialized,
    encoding: Encoding.UTF8,
  });

  let hasPrevious = false;
  try {
    await readNativeSnapshot(paths.main);
    hasPrevious = true;
    await deleteIfExists(paths.rollback);
    await Filesystem.copy({
      from: paths.main,
      to: paths.rollback,
      directory: Directory.Data,
    });
  } catch (error) {
    if (!isMissingNativeFileError(error)) {
      logger.warn(
        `[nativeLeakStorage] Existing snapshot is invalid in "${paths.main}".`,
        error,
      );
    }
  }

  await deleteIfExists(paths.main);
  try {
    await Filesystem.rename({
      from: paths.temp,
      to: paths.main,
      directory: Directory.Data,
    });
    await replaceBackupFromMain(paths);
    await writeBaselineSnapshotId(paths, snapshotId).catch((error) => {
      logger.warn(
        `[nativeLeakStorage] Could not update storage metadata for "${folderName}".`,
        error,
      );
    });
  } catch (error) {
    await restoreMainFromRollback(paths, hasPrevious).catch(
      ignoredError("legacyNativeStorage.restoreRollback"),
    );
    throw error;
  }

  let staleEntries = false;
  try {
    await deleteIfExists(paths.journal);
  } catch (error) {
    staleEntries = true;
    logger.warn(
      `[nativeLeakStorage] Could not remove stale journal for "${folderName}".`,
      error,
    );
  }
  await deleteIfExists(paths.rollback).catch((error) => {
    logger.warn(
      `[nativeLeakStorage] Could not remove rollback snapshot for "${folderName}".`,
      error,
    );
  });
  cache.set(folderName, {
    baselineReady: true,
    snapshotId,
    entryCount: 0,
    byteLength: staleEntries ? JOURNAL_MAX_BYTES : 0,
    truncatedTail: false,
    staleEntries,
  });
}

async function readFromPathWithJournal(snapshotPath, journalPath) {
  const snapshot = await readNativeSnapshot(snapshotPath);
  return readJournal(journalPath, snapshot);
}

export async function loadNativeProject(folderName) {
  const paths = getNativeProjectPaths(folderName);
  let mainError;
  try {
    const state = await readFromPathWithJournal(paths.main, paths.journal);
    const baselineSnapshotId = await readBaselineSnapshotId(paths);
    let backupExists = false;
    try {
      backupExists = await fileExists(paths.backup);
    } catch (error) {
      logger.warn(
        `[nativeLeakStorage] Could not inspect recovery snapshot for "${folderName}".`,
        error,
      );
    }
    let baselineReady =
      state.snapshotVersion === 3 &&
      state.snapshotId === baselineSnapshotId &&
      backupExists;
    if (!baselineReady) {
      try {
        await replaceBackupFromMain(paths);
        if (state.snapshotId) {
          await writeBaselineSnapshotId(paths, state.snapshotId);
        }
        baselineReady = true;
      } catch (error) {
        logger.warn(
          `[nativeLeakStorage] Could not refresh recovery baseline for "${folderName}".`,
          error,
        );
      }
    }
    cache.set(folderName, {
      baselineReady,
      snapshotId: state.snapshotId,
      entryCount: state.entryCount,
      byteLength: state.byteLength,
      truncatedTail: state.truncatedTail,
      staleEntries: state.staleEntries,
    });
    return { state, source: paths.main, recovered: false };
  } catch (error) {
    mainError = error;
  }

  try {
    const state = await readFromPathWithJournal(paths.backup, paths.journal);
    let baselineReady = false;
    try {
      await deleteIfExists(paths.main);
      await Filesystem.copy({
        from: paths.backup,
        to: paths.main,
        directory: Directory.Data,
      });
      if (state.snapshotId) {
        await writeBaselineSnapshotId(paths, state.snapshotId);
      }
      baselineReady = true;
    } catch (error) {
      logger.warn(
        `[nativeLeakStorage] Could not restore main snapshot for "${folderName}".`,
        error,
      );
    }
    cache.set(folderName, {
      baselineReady,
      snapshotId: state.snapshotId,
      entryCount: state.entryCount,
      byteLength: state.byteLength,
      truncatedTail: state.truncatedTail,
      staleEntries: state.staleEntries,
    });
    return {
      state,
      source: paths.backup,
      recovered: true,
      mainError,
    };
  } catch (backupError) {
    if (
      isMissingNativeFileError(mainError) &&
      isMissingNativeFileError(backupError)
    ) {
      return null;
    }
    throw Object.assign(
      new Error("Native project snapshots could not be read", {
        cause: isMissingNativeFileError(mainError) ? backupError : mainError,
      }),
      { mainError, backupError },
    );
  }
}

function shouldWriteSnapshot(mutation, nextLength, serializedEntry) {
  const changed = mutation.upserts.length + mutation.deletedIds.length;
  return (
    utf8Length(serializedEntry) > JOURNAL_MAX_ENTRY_BYTES ||
    changed > JOURNAL_MAX_CHANGED_RECORDS ||
    (nextLength >= 500 && changed / Math.max(nextLength, 1) > 0.25)
  );
}

export async function saveNativeProject(
  folderName,
  leaks,
  { syncState = null, previousLeaks = null, forceSnapshot = false } = {},
) {
  const paths = getNativeProjectPaths(folderName);
  const state = cache.get(folderName);
  const hasSnapshot = await fileExists(paths.main);
  const mutation =
    Array.isArray(previousLeaks) && state?.snapshotId
      ? createMutation(previousLeaks, leaks, syncState, state.snapshotId)
      : null;
  // Пустая строка, а не null: без дельты `!mutation` ниже уводит в снимок.
  const serializedEntry = mutation ? `${JSON.stringify(mutation)}\n` : "";
  if (
    forceSnapshot ||
    !hasSnapshot ||
    !state?.baselineReady ||
    state.truncatedTail ||
    state.staleEntries ||
    !mutation ||
    shouldWriteSnapshot(mutation, leaks.length, serializedEntry)
  ) {
    await writeSnapshot(folderName, leaks, syncState);
    return;
  }

  try {
    await Filesystem.appendFile({
      path: paths.journal,
      directory: Directory.Data,
      data: serializedEntry,
      encoding: Encoding.UTF8,
    });
  } catch (error) {
    logger.warn(
      `[nativeLeakStorage] Journal append failed for "${folderName}"; writing a snapshot instead.`,
      error,
    );
    await writeSnapshot(folderName, leaks, syncState);
    return;
  }

  const nextState = {
    baselineReady: true,
    snapshotId: state.snapshotId,
    entryCount: (state.entryCount ?? 0) + 1,
    byteLength: (state.byteLength ?? 0) + utf8Length(serializedEntry),
    truncatedTail: false,
    staleEntries: false,
  };
  cache.set(folderName, nextState);

  if (
    nextState.entryCount >= JOURNAL_MAX_ENTRIES ||
    nextState.byteLength >= JOURNAL_MAX_BYTES
  ) {
    try {
      await writeSnapshot(folderName, leaks, syncState);
    } catch (error) {
      logger.warn(
        `[nativeLeakStorage] Deferred journal compaction for "${folderName}".`,
        error,
      );
    }
  }
}

export async function writeNativeProjectSnapshot(
  folderName,
  leaks,
  syncState = null,
) {
  await writeSnapshot(folderName, leaks, syncState);
}
