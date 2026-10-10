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
 *
 * Маркеров два — у записей об утечках и у реестра компонентов: наборы
 * переезжали в базу порознь, и один не говорит ничего о другом.
 */

/**
 * @param {(folderName: string) => string} pathOf где лежит маркер набора
 * @param {string} label как набор называется в сообщениях
 */
function createSqliteMarker(pathOf, label) {
  const known = new Set();

  async function has(folderName) {
    if (known.has(folderName)) return true;
    try {
      await Filesystem.stat({
        path: pathOf(folderName),
        directory: Directory.Data,
      });
      known.add(folderName);
      return true;
    } catch (error) {
      if (isMissingNativeFileError(error)) return false;
      throw error;
    }
  }

  async function write(folderName) {
    if (await has(folderName)) return;
    const path = pathOf(folderName);
    try {
      await ensureNativeDirectory(
        path.substring(0, path.lastIndexOf("/")),
        Directory.Data,
      );
      await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ version: 1, engine: "sqlite" }),
      });
      known.add(folderName);
    } catch (error) {
      logger.warn(
        `[${label}] Could not persist the SQLite migration marker for "${folderName}".`,
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

  return {
    path: pathOf,
    has,
    write,
    /** Плагина нет, а набор уже в базе: JSON рядом — устаревшая копия. */
    async assertLegacyFallbackAllowed(folderName, cause) {
      if (!folderName || !(await has(folderName))) return;
      throw Object.assign(
        new Error(
          `Native SQLite storage is unavailable for migrated ${label} "${folderName}"; refusing to load a stale JSON recovery copy.`,
          { cause },
        ),
        { code: "SQLITE_STORAGE_UNAVAILABLE" },
      );
    },
    /** Маркер есть, а база о наборе не знает: данные пропали. */
    async assertNotLost(folderName) {
      if (!folderName || !(await has(folderName))) return;
      throw Object.assign(
        new Error(`SQLite has no data for migrated ${label} "${folderName}".`),
        { code: "SQLITE_PROJECT_MISSING" },
      );
    },
    /** Забыть маркер набора — или все, если папка не названа. */
    forget(folderName) {
      if (folderName == null) known.clear();
      else known.delete(folderName);
    },
  };
}

const leakMarker = createSqliteMarker(
  (folderName) => `LeakReports/${folderName}/data/data.sqlite.json`,
  "nativeLeakStorage",
);

export const componentSqliteMarker = createSqliteMarker(
  (folderName) => `LeakReports/${folderName}/data/components.sqlite.json`,
  "components",
);

export const getSqliteMarkerPath = leakMarker.path;
export const hasSqliteMarker = leakMarker.has;
export const writeSqliteMarker = leakMarker.write;
export const assertLegacyFallbackAllowed =
  leakMarker.assertLegacyFallbackAllowed;
export const assertSqliteProjectNotLost = leakMarker.assertNotLost;
export const forgetSqliteMarker = leakMarker.forget;
