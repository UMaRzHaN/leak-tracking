import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { createIdbConnection } from "@/repositories/idbConnection";
import { isMissingNativeFileError } from "@/repositories/nativeFileErrors";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";
import { ignoredError } from "@/utils/ignoredError";
import { STORAGE_KEYS } from "./storageKeys";

/**
 * Запасная копия списка проектов вне localStorage.
 *
 * Список — это то, по чему приложение вообще находит данные: имя проекта, его
 * тип, папка и идентификатор, под которым лежат записи. Сами записи хранятся
 * в IndexedDB или SQLite с копиями и контрольными суммами, а список — одной
 * строкой в localStorage. Пропади эта строка, и все проекты целы, но
 * невидимы: приложение открывается как в первый раз.
 *
 * Копия пишется после каждого сохранения списка, в фоне и по очереди:
 * дождаться её синхронно нельзя, а две записи вразнобой могли бы оставить
 * старшую версию последней. Читается она только когда ключа списка нет вовсе —
 * пустой, но существующий список означает «проектов нет», и поднимать его из
 * копии было бы воскрешением удалённого.
 */

const WEB_DB = "LeakTrackingProjectsDB";
const WEB_STORE = "lists";
const WEB_KEY = "projects";
const NATIVE_DIR = "LeakReports";
const NATIVE_PATH = `${NATIVE_DIR}/projects.backup.json`;
const NATIVE_TEMP_PATH = `${NATIVE_PATH}.tmp`;

const openWebDb = createIdbConnection(WEB_DB, 1, (db) => {
  if (!db.objectStoreNames.contains(WEB_STORE)) db.createObjectStore(WEB_STORE);
});

function settle(tx, getResult) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(getResult());
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function writeWeb(list) {
  const db = await openWebDb();
  if (!db) return;
  const tx = db.transaction(WEB_STORE, "readwrite");
  tx.objectStore(WEB_STORE).put({ list, savedAt: Date.now() }, WEB_KEY);
  await settle(tx, () => undefined);
}

async function readWeb() {
  const db = await openWebDb();
  if (!db) return null;
  const tx = db.transaction(WEB_STORE, "readonly");
  const request = tx.objectStore(WEB_STORE).get(WEB_KEY);
  return settle(tx, () => request.result?.list ?? null);
}

async function deleteNativeFile(path) {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch (error) {
    if (!isMissingNativeFileError(error)) throw error;
  }
}

async function writeNative(list) {
  // Папка обычно уже есть; если её создать не вышло, об этом скажет запись.
  await Filesystem.mkdir({
    path: NATIVE_DIR,
    directory: Directory.Data,
    recursive: true,
  }).catch(ignoredError("projects.mirrorFolder"));
  await Filesystem.writeFile({
    path: NATIVE_TEMP_PATH,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify({ list, savedAt: Date.now() }),
  });
  // Сначала целая новая копия, потом замена: оборвавшись между удалением и
  // переименованием, запись оставляет временный файл, и чтение возьмёт его.
  await deleteNativeFile(NATIVE_PATH);
  await Filesystem.rename({
    from: NATIVE_TEMP_PATH,
    to: NATIVE_PATH,
    directory: Directory.Data,
  });
}

async function readNativeFile(path) {
  try {
    const file = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(String(file.data))?.list ?? null;
  } catch (error) {
    if (isMissingNativeFileError(error)) return null;
    throw error;
  }
}

async function readNative() {
  return (
    (await readNativeFile(NATIVE_PATH)) ??
    (await readNativeFile(NATIVE_TEMP_PATH))
  );
}

let queue = Promise.resolve();
let pending = /** @type {any[]|null} */ (null);

/**
 * Ставит копию списка в очередь. Из нескольких записей подряд до диска доходит
 * последняя: промежуточные не нужны никому.
 *
 * @param {any[]} list
 * @returns {Promise<void>} когда очередь дошла до конца; ошибки не бросает
 */
export function mirrorProjectList(list) {
  const scheduled = pending === null;
  pending = list;
  if (scheduled) {
    queue = queue.then(async () => {
      const next = pending;
      pending = null;
      try {
        await (isNative ? writeNative(next) : writeWeb(next));
      } catch (error) {
        logger.warn("[projects] Could not mirror the project list:", error);
      }
    });
  }
  return queue;
}

/**
 * Список из запасной копии, или null, если копии нет или она не читается.
 *
 * @returns {Promise<any[]|null>}
 */
export async function readProjectListMirror() {
  try {
    const list = await (isNative ? readNative() : readWeb());
    return Array.isArray(list) ? list : null;
  } catch (error) {
    logger.warn("[projects] Could not read the project list mirror:", error);
    return null;
  }
}

/**
 * Есть ли список проектов в localStorage вообще. Пустой массив — это ответ
 * «проектов нет»; отсутствующий ключ — «список потерян или его не заводили».
 */
function hasStoredProjectList() {
  try {
    return localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST) !== null;
  } catch {
    return false;
  }
}

/**
 * Список из запасной копии, прошедший ту же проверку, что и основной; null —
 * если он не годится.
 *
 * @param {unknown} list
 */
function validRecoveredProjects(list, validate) {
  if (!Array.isArray(list) || list.length === 0) return null;
  try {
    return validate(list);
  } catch {
    return null;
  }
}

/**
 * Поднимает список проектов из запасной копии, если в localStorage его нет.
 *
 * Зовётся до первого рендера: провайдер проектов читает список синхронно, а
 * копия лежит там, откуда синхронно не прочитать. Если список на месте, копия
 * только обновляется — у сборок, которые её ещё не вели, она появится с
 * первого же запуска, а не с первой правки списка.
 *
 * Чтение и проверка списка приходят параметрами, а не импортом: этот модуль
 * грузится лениво, и статический импорт хранилища проектов отсюда заставлял
 * сборщик выносить его из стартового чанка в отдельный — дороже на килобайт.
 *
 * @param {{loadProjects: () => any[], validateStoredProjects: (list: any[]) => any[]}} storage
 * @returns {Promise<any[]|null>} восстановленный список, если пришлось
 */
export async function recoverMissingProjectList({
  loadProjects,
  validateStoredProjects,
}) {
  if (hasStoredProjectList()) {
    try {
      void mirrorProjectList(loadProjects());
    } catch {
      // Испорченный список разбирает свой экран ошибки; копировать его незачем.
    }
    return null;
  }

  const recovered = validRecoveredProjects(
    await readProjectListMirror(),
    validateStoredProjects,
  );
  if (!recovered || hasStoredProjectList()) return null;
  localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify(recovered));
  logger.warn(
    `[projects] The project list was missing; restored ${recovered.length} project(s) from its mirror.`,
  );
  return recovered;
}
