import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { logger } from "@/utils/logger";
import { isMissingNativeFileError } from "@/repositories/nativeFileErrors";
import { ensureNativeDirectory } from "@/repositories/nativeDirectory";

/**
 * Маркер переезда проекта в SQLite: файл рядом с данными проекта, который
 * появляется только после того, как база приняла проект.
 *
 * Он отвечает на один вопрос — где сейчас живые данные проекта. Пока маркера
 * нет, JSON-снимок и журнал прежних сборок — это и есть проект. Когда он есть,
 * те же файлы — устаревшая копия, и подхватывать их вместо базы нельзя: ни
 * когда недоступен сам плагин, ни когда база о проекте не знает.
 */
const sqliteMarkers = new Set();

export function getSqliteMarkerPath(folderName) {
  return `LeakReports/${folderName}/data/data.sqlite.json`;
}

export async function hasSqliteMarker(folderName) {
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

export async function writeSqliteMarker(folderName) {
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

export async function assertLegacyFallbackAllowed(folderName, cause) {
  if (!folderName || !(await hasSqliteMarker(folderName))) return;
  throw Object.assign(
    new Error(
      `Native SQLite storage is unavailable for migrated project "${folderName}"; refusing to load a stale JSON recovery copy.`,
      { cause },
    ),
    { code: "SQLITE_STORAGE_UNAVAILABLE" },
  );
}

export async function assertSqliteProjectNotLost(folderName) {
  if (!folderName || !(await hasSqliteMarker(folderName))) return;
  throw Object.assign(
    new Error(`SQLite has no data for migrated project "${folderName}".`),
    { code: "SQLITE_PROJECT_MISSING" },
  );
}

/** Забыть маркер проекта — или все, если папка не названа. */
export function forgetSqliteMarker(folderName) {
  if (folderName == null) sqliteMarkers.clear();
  else sqliteMarkers.delete(folderName);
}
