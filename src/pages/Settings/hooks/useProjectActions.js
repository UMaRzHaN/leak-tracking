import { useCallback } from "react";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isNative } from "@/utils/platform";
import { useProject } from "@/app/project/ProjectContext";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { PROJECT_META } from "@/configs/projects";
import { clearMapCache } from "@/services/maps/tileCache";

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
  const isFormDirty = Object.values(form).some(
    (value) => value !== null && value !== "" && value !== undefined,
  );

  const handleSelect = useCallback(
    async (id) => {
      if (id === activeProject?.id) return;

      if (isFormDirty) {
        const ok = window.confirm(
          lang === "ru"
            ? "Переключить проект? Форма добавления утечки будет сброшена."
            : "Switch project? The leak entry form will be reset.",
        );
        if (!ok) return;
      }

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
    [
      activeProject?.id,
      clearForm,
      isFormDirty,
      lang,
      notify,
      selectProject,
      setCacheInfo,
    ],
  );

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
          const dataPath = `LeakReports/${newFolderName}/data/data.json`;
          const fileResult = await Filesystem.readFile({
            path: dataPath,
            directory: Directory.Data,
            encoding: "utf8",
          }).catch(() => null);

          if (fileResult) {
            try {
              const leaks = JSON.parse(fileResult.data || "[]");
              const oldPrefix = `data://LeakReports/${oldFolderName}/`;
              const newPrefix = `data://LeakReports/${newFolderName}/`;
              const updated = leaks.map((leak) => ({
                ...leak,
                ...(leak.photo?.startsWith(oldPrefix)
                  ? { photo: leak.photo.replace(oldPrefix, newPrefix) }
                  : {}),
                ...(leak.photo_after?.startsWith(oldPrefix)
                  ? {
                      photo_after: leak.photo_after.replace(
                        oldPrefix,
                        newPrefix,
                      ),
                    }
                  : {}),
              }));

              await Filesystem.writeFile({
                path: dataPath,
                directory: Directory.Data,
                data: JSON.stringify(updated),
                encoding: "utf8",
              });
            } catch {
              // ignore invalid data.json
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
    (id) => {
      const target = projects.find((project) => project.id === id);
      if (!target) return;
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
    handleRename,
    handleRemove,
    handleAdd,
  };
}
