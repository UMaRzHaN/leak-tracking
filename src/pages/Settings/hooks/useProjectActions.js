import { useCallback } from "react";
import { isNative } from "../../../utils/platform";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useProject } from "../../../app/settings/ProjectContext";
import { useLeakFormContext } from "../../../context/LeakFormContext";
import { PROJECT_META } from "../../../configs/projects";
import { clearMapCache } from "../../../services/maps/tileCache";

export function useProjectActions({ setCacheInfo, notify }) {
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
  const isFormDirty = Object.values(form).some((v) => v !== null && v !== "" && v !== undefined);

  const handleSelect = useCallback(
    async (id) => {
      if (id === activeProject?.id) return;

      if (isFormDirty) {
        const ok = window.confirm("Переключить проект? Форма добавления утечки будет сброшена.");
        if (!ok) return;
      }

      selectProject(id);
      clearForm?.();
      await clearMapCache();
      setCacheInfo({ count: 0, sizeMB: 0 });
      notify("info", "Проект переключён, кэш карты очищен");
    },
    [activeProject, selectProject, clearForm, notify, isFormDirty, setCacheInfo],
  );

  const handleRename = useCallback(
    async (id, name) => {
      // Обновляет только display name. folderName обновится в applyFolderRename
      // после завершения FS-операций, чтобы useProjectData не читал новый путь раньше времени.
      const result = renameProject(id, name);
      if (!result) return;
      const { oldFolderName, newFolderName } = result;

      if (isNative && oldFolderName !== newFolderName) {
        await Filesystem.rename({
          from: `LeakReports/${oldFolderName}`,
          to: `LeakReports/${newFolderName}`,
          directory: Directory.Data,
        }).catch(() => {});

        // Патчим пути к фото в data.json — они содержат folderName в строке пути
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
            const updated = leaks.map((l) => ({
              ...l,
              ...(l.photo?.startsWith(oldPrefix) ? { photo: l.photo.replace(oldPrefix, newPrefix) } : {}),
              ...(l.photo_after?.startsWith(oldPrefix) ? { photo_after: l.photo_after.replace(oldPrefix, newPrefix) } : {}),
            }));
            await Filesystem.writeFile({
              path: dataPath,
              directory: Directory.Data,
              data: JSON.stringify(updated),
              encoding: "utf8",
            });
          } catch {
            // data.json не распарсился — пропускаем, не критично
          }
        }

        await Filesystem.rename({
          from: oldFolderName,
          to: newFolderName,
          directory: Directory.Documents,
        }).catch(() => {});
      }

      if (oldFolderName !== newFolderName) {
        applyFolderRename(id, newFolderName);
      }

      notify("success", "Название сохранено");
    },
    [renameProject, applyFolderRename, notify],
  );

  const handleRemove = useCallback(
    (id) => {
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      removeProject(id);
      notify("warning", `Проект «${target.name}» удалён`);
    },
    [projects, removeProject, notify],
  );

  const handleAdd = useCallback(
    (name, type) => {
      addProject(name, type);
      notify("success", `Проект «${name || PROJECT_META[type].title}» создан`);
    },
    [addProject, notify],
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
