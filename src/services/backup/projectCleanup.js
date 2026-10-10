import { Directory, Filesystem } from "@capacitor/filesystem";
import { projectKeyPrefix, STORAGE_KEYS } from "@/app/project/storageKeys";
import { clearProjectSettings } from "@/app/project/projectSettings";
import { clearProjectFilters } from "@/app/project/projectFilters";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { SchemaRepository } from "@/repositories/SchemaRepository";
import { clearProjectSyncState } from "@/services/sync/projectSyncState";
import { isNative } from "@/utils/platform";
import { saveMonitoringRound } from "@/utils/monitoringRound";
import { restoreProjectRounds } from "@/app/project/projectRounds";
import { saveAcceptances } from "@/utils/acceptanceStorage";
import { saveSurvey } from "@/utils/surveyStorage";
import { ignoredError } from "@/utils/ignoredError";

/**
 * `ComponentRepository` тянет за собой мост Capacitor и нативное хранилище
 * карточек. Статический импорт клал его в стартовый чанк — сборка предупреждала
 * об этом прямо, — хотя нужен он только тем, кто уже открыл реестр, экспорт или
 * импорт. Здесь он читается на месте вызова.
 */
function componentRepository() {
  return import("@/repositories/ComponentRepository").then(
    (module) => module.ComponentRepository,
  );
}

/**
 * Удаляет всё, что проект оставил на устройстве.
 *
 * Шаги независимы друг от друга: пока они шли цепочкой await, первая же
 * осечка — не стёрлись утечки или снимки — обрывала уборку, и реестр,
 * чертежи и папка проекта оставались на диске навсегда. Теперь каждый шаг
 * выполняется, ошибки собираются и бросаются в конце: одна — как есть,
 * несколько — одним AggregateError.
 */
export async function deleteProjectArtifacts(project) {
  if (!project?.id) return;

  /** @type {unknown[]} */
  const errors = [];
  const step = async (run) => {
    try {
      await run();
    } catch (error) {
      errors.push(error);
    }
  };

  await step(() => {
    localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(project.id));
    localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(project.id));
    localStorage.removeItem(STORAGE_KEYS.PROJECT_IMPORT_OPERATION(project.id));
  });
  await step(() => clearProjectFilters(project.id));
  await step(() => clearProjectSettings(project.id));
  // Обходы, накладные и обследование лежат в localStorage по id проекта, как
  // и настройки: без уборки они переживали удаление проекта навсегда. Обходы
  // ремонтов и сверки — вместе с обходом мониторинга.
  await step(() => saveMonitoringRound(project.id, null));
  await step(() => restoreProjectRounds(project.id, null));
  await step(() => saveAcceptances(project.id, []));
  await step(() => saveSurvey(project.id, null));
  await step(() => clearProjectSyncState(project.id));
  await step(() =>
    (LeakRepository.purge ?? LeakRepository.clear)({
      projectId: project.id,
      folderName: project.folderName,
    }),
  );
  await step(() =>
    PhotoRepository.deleteProjectPhotos(project.id, project.folderName),
  );
  // Реестр живёт в хранилище со своим ключом, а не в папке проекта: на вебе он
  // оставался в базе навсегда, а на устройстве — в SQLite, привязанный к имени
  // папки. Проект, заведённый потом под тем же именем, получал чужие карточки,
  // которых человек не заводил.
  await Promise.resolve()
    .then(async () => (await componentRepository()).remove(project))
    .catch(ignoredError("projectCleanup.removeComponents"));
  await Promise.resolve()
    .then(() => SchemaRepository.removeProjectSchemas(project))
    .catch(ignoredError("projectCleanup.removeSchemas"));

  if (isNative && project.folderName) {
    await Filesystem.rmdir({
      path: `LeakReports/${project.folderName}`,
      directory: Directory.Data,
      recursive: true,
    }).catch(ignoredError("projectCleanup.removeFolder"));
  }

  // Последним, после хранилищ: всё, что ещё осталось под префиксом проекта, —
  // маршрут обхода, черновики форм, скрытые поля реестра, история и листы
  // выгрузок. Поимённая уборка выше пропускала каждый ключ, заведённый позже.
  await step(() => removeProjectScopedKeys(project.id));

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      `Project cleanup failed in ${errors.length} steps`,
    );
  }
}

function removeProjectScopedKeys(projectId) {
  const prefix = projectKeyPrefix(projectId);
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

export async function rollbackImportedProject(project, removeProject) {
  if (!project?.id) return { metadataRemoved: false, cleanupComplete: true };
  if (typeof removeProject !== "function") {
    throw new TypeError("A project metadata remover is required for rollback");
  }

  // Metadata is the reachability boundary. Never destroy the only recoverable
  // artifacts while the project can still remain visible after a failed write.
  const removed = removeProject(project.id);
  if (removed === false) {
    throw new Error(`Could not remove imported project "${project.id}"`);
  }

  let cleanupError = /** @type {unknown} */ (null);
  try {
    await deleteProjectArtifacts(project);
  } catch (error) {
    cleanupError = error;
  }

  return {
    metadataRemoved: true,
    cleanupComplete: cleanupError === null,
    cleanupError,
  };
}
