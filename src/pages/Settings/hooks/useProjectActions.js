import { useCallback, useMemo, useState } from "react";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isNative } from "@/utils/platform";
import { useProject } from "@/app/project/ProjectContext";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { PROJECT_META } from "@/configs/projects";
import { STORAGE_KEYS } from "@/app/project/storageKeys";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { LeakRepository } from "@/repositories/LeakRepository";
import { clearMapCache } from "@/services/maps/tileCache";

const CLOSED_SWITCH_STATE = {
  open: false,
  nextProjectId: null,
};

function remapPhotoPath(path, oldPrefix, newPrefix) {
  return typeof path === "string" && path.startsWith(oldPrefix)
    ? path.replace(oldPrefix, newPrefix)
    : path;
}

export function remapProjectPhotoPaths(leaks, oldFolderName, newFolderName) {
  const oldPrefix = `data://LeakReports/${oldFolderName}/`;
  const newPrefix = `data://LeakReports/${newFolderName}/`;

  return leaks.map((leak) => ({
    ...leak,
    photo: remapPhotoPath(leak.photo, oldPrefix, newPrefix),
    photo_after: remapPhotoPath(leak.photo_after, oldPrefix, newPrefix),
    photo_repair: remapPhotoPath(leak.photo_repair, oldPrefix, newPrefix),
    ...(Array.isArray(leak.monitoringRecords)
      ? {
          monitoringRecords: leak.monitoringRecords.map((record) => ({
            ...record,
            photo: remapPhotoPath(record?.photo, oldPrefix, newPrefix),
          })),
        }
      : {}),
  }));
}

async function deleteProjectArtifacts(project) {
  if (!project?.id) return;

  localStorage.removeItem(STORAGE_KEYS.PROJECT_DATA(project.id));
  localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(project.id));
  localStorage.removeItem(STORAGE_KEYS.PROJECT_HIDDEN_FIELDS(project.id));
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

  await Filesystem.rmdir({
    path: project.folderName,
    directory: Directory.Documents,
    recursive: true,
  }).catch(() => {});
}

export function useProjectActions({ setCacheInfo, notify }) {
  const { lang } = useLanguage();
  const {
    projects,
    activeProject,
    addProject,
    selectProject,
    renameProject,
    applyFolderRename,
    removeProject,
  } = useProject();

  const { form, clearForm } = useLeakFormContext();
  const [projectSwitchState, setProjectSwitchState] =
    useState(CLOSED_SWITCH_STATE);

  const isFormDirty = Object.values(form).some(
    (value) => value !== null && value !== "" && value !== undefined,
  );

  const projectSwitchTexts = useMemo(
    () => ({
      title: lang === "ru" ? "Переключить проект?" : "Switch project?",
      description:
        lang === "ru"
          ? "Форма добавления утечки будет сброшена."
          : "The leak entry form will be reset.",
      confirmLabel: lang === "ru" ? "Переключить" : "Switch",
      cancelLabel: lang === "ru" ? "Отмена" : "Cancel",
    }),
    [lang],
  );

  const performProjectSwitch = useCallback(
    async (id) => {
      selectProject(id);
      clearForm?.();
      await clearMapCache();
      setCacheInfo({ count: 0, sizeMB: 0 });
      notify(
        "info",
        lang === "ru"
          ? "Проект переключён, кэш карты очищен"
          : "Project switched, map cache cleared",
      );
    },
    [clearForm, lang, notify, selectProject, setCacheInfo],
  );

  const handleSelect = useCallback(
    async (id) => {
      if (id === activeProject?.id) return;

      if (isFormDirty) {
        setProjectSwitchState({ open: true, nextProjectId: id });
        return;
      }

      await performProjectSwitch(id);
    },
    [activeProject?.id, isFormDirty, performProjectSwitch],
  );

  const confirmProjectSwitch = useCallback(async () => {
    if (!projectSwitchState.nextProjectId) return;
    const nextProjectId = projectSwitchState.nextProjectId;
    setProjectSwitchState(CLOSED_SWITCH_STATE);
    await performProjectSwitch(nextProjectId);
  }, [performProjectSwitch, projectSwitchState.nextProjectId]);

  const cancelProjectSwitch = useCallback(() => {
    setProjectSwitchState(CLOSED_SWITCH_STATE);
  }, []);

  const handleRename = useCallback(
    async (id, name) => {
      const result = renameProject(id, name);
      if (!result) return;
      const { oldFolderName, newFolderName } = result;
      let folderRenameSucceeded = true;

      if (isNative && oldFolderName !== newFolderName) {
        folderRenameSucceeded = await Filesystem.rename({
          from: `LeakReports/${oldFolderName}`,
          to: `LeakReports/${newFolderName}`,
          directory: Directory.Data,
        })
          .then(() => true)
          .catch(() => false);

        if (folderRenameSucceeded) {
          for (const fileName of ["data.json", "data.backup.json"]) {
            const dataPath = `LeakReports/${newFolderName}/data/${fileName}`;
            const fileResult = await Filesystem.readFile({
              path: dataPath,
              directory: Directory.Data,
              encoding: "utf8",
            }).catch(() => null);

            if (fileResult) {
              try {
                const leaks = JSON.parse(fileResult.data || "[]");
                const updated = remapProjectPhotoPaths(
                  leaks,
                  oldFolderName,
                  newFolderName,
                );

                await Filesystem.writeFile({
                  path: dataPath,
                  directory: Directory.Data,
                  data: JSON.stringify(updated),
                  encoding: "utf8",
                });
              } catch {
                // Keep an invalid recovery file untouched for manual recovery.
              }
            }
          }

          await Filesystem.rename({
            from: oldFolderName,
            to: newFolderName,
            directory: Directory.Documents,
          }).catch(() => {});
        }
      }

      if (
        oldFolderName !== newFolderName &&
        (!isNative || folderRenameSucceeded)
      ) {
        applyFolderRename(id, newFolderName);
      }

      notify(
        folderRenameSucceeded ? "success" : "warning",
        folderRenameSucceeded
          ? lang === "ru"
            ? "Название сохранено"
            : "Name saved"
          : lang === "ru"
            ? "Имя проекта сохранено, но папку на устройстве переименовать не удалось"
            : "Project name saved, but the device folder could not be renamed",
      );
    },
    [applyFolderRename, lang, notify, renameProject],
  );

  const handleRemove = useCallback(
    async (id) => {
      const target = projects.find((project) => project.id === id);
      if (!target) return;
      await deleteProjectArtifacts(target);
      removeProject(id);
      notify(
        "warning",
        lang === "ru"
          ? `Проект «${target.name}» удалён`
          : `Project "${target.name}" deleted`,
      );
    },
    [lang, notify, projects, removeProject],
  );

  const handleAdd = useCallback(
    (name, type) => {
      addProject(name, type);
      notify(
        "success",
        lang === "ru"
          ? `Проект «${name || PROJECT_META[type].title}» создан`
          : `Project "${name || PROJECT_META[type].title}" created`,
      );
    },
    [addProject, lang, notify],
  );

  return {
    projects,
    activeProject,
    handleSelect,
    projectSwitchState: {
      ...projectSwitchState,
      ...projectSwitchTexts,
    },
    confirmProjectSwitch,
    cancelProjectSwitch,
    handleRename,
    handleRemove,
    handleAdd,
  };
}
