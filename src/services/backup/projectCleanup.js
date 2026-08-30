import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { clearProjectSettings } from "@/app/project/projectSettings";
import { clearProjectFilters } from "@/app/project/projectFilters";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { SchemaRepository } from "@/repositories/SchemaRepository";
import { clearProjectSyncState } from "@/services/sync/projectSyncState";
import { isNative } from "@/utils/platform";
import { saveMonitoringRound } from "@/utils/monitoringRound";
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

export async function deleteProjectArtifacts(project) {
  if (!project?.id) return;

  localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(project.id));
  localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(project.id));
  localStorage.removeItem(STORAGE_KEYS.PROJECT_IMPORT_OPERATION(project.id));
  clearProjectFilters(project.id);
  clearProjectSettings(project.id);
  await clearProjectSyncState(project.id);
  await (LeakRepository.purge ?? LeakRepository.clear)({
    projectId: project.id,
    folderName: project.folderName,
  });
  await PhotoRepository.deleteProjectPhotos(project.id, project.folderName);
  // Реестр живёт в хранилище со своим ключом, а не в папке проекта: на вебе он
  // оставался в базе навсегда, а на устройстве — в SQLite, привязанный к имени
  // папки. Проект, заведённый потом под тем же именем, получал чужие карточки,
  // которых человек не заводил.
  await Promise.resolve((await componentRepository()).remove(project)).catch(
    ignoredError("projectCleanup.removeComponents"),
  );
  await Promise.resolve(SchemaRepository.removeProjectSchemas(project)).catch(
    ignoredError("projectCleanup.removeSchemas"),
  );

  if (!isNative || !project.folderName) return;

  await Filesystem.rmdir({
    path: `LeakReports/${project.folderName}`,
    directory: Directory.Data,
    recursive: true,
  }).catch(ignoredError("projectCleanup.removeFolder"));
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
    saveMonitoringRound(project.id, null);
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
