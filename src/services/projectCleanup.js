import { Directory, Filesystem } from "@capacitor/filesystem";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { clearProjectSettings } from "@/app/project/projectSettings";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { isNative } from "@/utils/platform";
import { saveMonitoringRound } from "@/utils/monitoringRound";

export async function deleteProjectArtifacts(project) {
  if (!project?.id) return;

  localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(project.id));
  localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(project.id));
  clearProjectSettings(project.id);
  localStorage.removeItem(STORAGE_KEYS.PROJECT_SYNC_STATE(project.id));
  localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS_UPDATED_AT(project.id));
  await LeakRepository.clear({
    projectId: project.id,
    folderName: project.folderName,
  });
  await PhotoRepository.deleteProjectPhotos(project.id, project.folderName);

  if (!isNative || !project.folderName) return;

  await Filesystem.rmdir({
    path: `LeakReports/${project.folderName}`,
    directory: Directory.Data,
    recursive: true,
  }).catch(() => {});
}

export async function rollbackImportedProject(project, removeProject) {
  if (!project?.id) return;

  saveMonitoringRound(project.id, null);
  try {
    await deleteProjectArtifacts(project);
  } catch {
    // Continue removing the project from the UI even if storage cleanup fails.
  }
  if (typeof removeProject === "function") {
    try {
      removeProject(project.id);
    } catch {
      // Ignore rollback cleanup errors.
    }
  }
}
