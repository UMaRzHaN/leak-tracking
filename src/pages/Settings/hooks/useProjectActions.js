import { errorText } from "@/utils/appError";
import { useCallback, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { isNative } from "@/utils/platform";
import { useProject } from "@/app/project/ProjectContext";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { PROJECT_META } from "@/configs/projectMeta";
import { clearMapCache } from "@/services/maps/tileCache";
import { deleteProjectArtifacts } from "@/services/backup/projectCleanup";
import { isLeakFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";
import { MONITORING_PHOTO_FIELDS } from "@/utils/photoFields";
import { fromEntries } from "@/utils/fromEntries";

export { deleteProjectArtifacts };

const CLOSED_SWITCH_STATE = /** @type {{
  open: boolean,
  nextProjectId: string|null,
  pendingAction: {type: string, id?: any, name?: any, projectType?: any}|null,
}} */ ({
  open: false,
  nextProjectId: null,
  pendingAction: null,
});

const CLOSED_SYNC_ID_EDITOR = {
  open: false,
  projectId: null,
  value: "",
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
            ...fromEntries(
              MONITORING_PHOTO_FIELDS.map((field) => [
                field,
                remapPhotoPath(record?.[field], oldPrefix, newPrefix),
              ]),
            ),
          })),
        }
      : {}),
  }));
}

export function useProjectActions({ setCacheInfo, notify }) {
  const { t } = useLanguage();
  const {
    projects,
    activeProject,
    addProject,
    selectProject,
    renameProject,
    applyFolderRename,
    removeProject,
    replaceProjectSyncId,
    restoreProjectMetadata,
    restoreProjectSnapshot,
    ensureProjectSyncId,
  } = useProject();

  const { form, clearForm } = useLeakFormContext();
  const [projectSwitchState, setProjectSwitchState] =
    useState(CLOSED_SWITCH_STATE);
  const [syncIdEditorState, setSyncIdEditorState] = useState(
    CLOSED_SYNC_ID_EDITOR,
  );
  const removingProjectIdsRef = useRef(new Set());

  const isFormDirty = isLeakFormDirty(form);

  const projectSwitchTexts = useMemo(
    () => ({
      title: t("settings.switchProject"),
      description: t("settings.theLeakEntryForm"),
      confirmLabel: t("settings.switch"),
      cancelLabel: t("settings.cancel"),
    }),
    [t],
  );

  const clearProjectScopedState = useCallback(async () => {
    clearForm?.();
    await clearMapCache();
    setCacheInfo({ count: 0, sizeMB: 0 });
  }, [clearForm, setCacheInfo]);
  const performProjectSwitch = useCallback(
    async (id) => {
      selectProject(id);
      await clearProjectScopedState();
      notify("info", t("settings.projectSwitchedMapCache"));
    },
    [clearProjectScopedState, notify, selectProject, t],
  );

  const handleSelect = useCallback(
    async (id) => {
      if (id === activeProject?.id) return;

      if (isFormDirty) {
        setProjectSwitchState({
          open: true,
          nextProjectId: id,
          pendingAction: { type: "select", id },
        });
        return;
      }

      await performProjectSwitch(id);
    },
    [activeProject?.id, isFormDirty, performProjectSwitch],
  );

  const cancelProjectSwitch = useCallback(() => {
    setProjectSwitchState(CLOSED_SWITCH_STATE);
  }, []);
  const handleRename = useCallback(
    async (id, name) => {
      const result = renameProject(id, name);
      if (!result) return;
      const { oldFolderName, newFolderName } = result;

      // Native folder names are storage identifiers, not display names. Keep
      // them immutable so a failed filesystem rename can never detach data or
      // photo paths from the project. Web storage is keyed by project id, so
      // updating its cosmetic folder name is safe.
      if (!isNative && oldFolderName !== newFolderName) {
        applyFolderRename(id, newFolderName);
      }
      notify("success", t("settings.nameSaved"));
    },
    [applyFolderRename, notify, renameProject, t],
  );

  const performProjectRemove = useCallback(
    async (id) => {
      const target = projects.find((project) => project.id === id);
      if (!target || removingProjectIdsRef.current.has(id)) return;
      removingProjectIdsRef.current.add(id);
      const removesActiveProject = target.id === activeProject?.id;
      let cleanupComplete = true;
      try {
        // Remove the project metadata first. If this persistence step fails,
        // its data and photos must remain untouched and recoverable.
        try {
          removeProject(id);
        } catch (error) {
          notify(
            "error",
            t("settings.couldNotRemoveProject", {
              v1: target.name,
              v2: errorText(error, t),
            }),
          );
          return;
        }

        try {
          await deleteProjectArtifacts(target);
        } catch {
          cleanupComplete = false;
        }
        if (removesActiveProject) {
          try {
            await clearProjectScopedState();
          } catch {
            cleanupComplete = false;
          }
        }
        notify(
          cleanupComplete ? "warning" : "error",
          cleanupComplete
            ? t("settings.projectVDeleted", { v1: target.name })
            : t("settings.projectVWasRemoved", { v1: target.name }),
        );
      } finally {
        removingProjectIdsRef.current.delete(id);
      }
    },
    [
      activeProject?.id,
      clearProjectScopedState,
      notify,
      projects,
      removeProject,
      t,
    ],
  );

  const handleRemove = useCallback(
    async (id) => {
      const target = projects.find((project) => project.id === id);
      if (!target) return;
      if (target.id === activeProject?.id && isFormDirty) {
        setProjectSwitchState({
          open: true,
          nextProjectId: null,
          pendingAction: { type: "remove", id },
        });
        return;
      }
      await performProjectRemove(id);
    },
    [activeProject?.id, isFormDirty, performProjectRemove, projects],
  );

  const performProjectAdd = useCallback(
    async (name, type) => {
      addProject(name, type);
      await clearProjectScopedState();
      notify(
        "success",
        t("settings.projectVCreated", { v1: name || PROJECT_META[type].title }),
      );
    },
    [addProject, clearProjectScopedState, notify, t],
  );

  const handleAdd = useCallback(
    async (name, type) => {
      if (isFormDirty) {
        setProjectSwitchState({
          open: true,
          nextProjectId: null,
          pendingAction: { type: "add", name, projectType: type },
        });
        return;
      }
      await performProjectAdd(name, type);
    },
    [isFormDirty, performProjectAdd],
  );

  const confirmProjectSwitch = useCallback(async () => {
    const pendingAction = projectSwitchState.pendingAction;
    if (!pendingAction) return;
    try {
      if (pendingAction.type === "select") {
        await performProjectSwitch(pendingAction.id);
      } else if (pendingAction.type === "add") {
        await performProjectAdd(pendingAction.name, pendingAction.projectType);
      } else if (pendingAction.type === "remove") {
        await performProjectRemove(pendingAction.id);
      }
    } catch (error) {
      notify(
        "error",
        t("settings.couldNotSwitchProject", { v1: errorText(error, t) }),
      );
    } finally {
      setProjectSwitchState(CLOSED_SWITCH_STATE);
    }
  }, [
    notify,
    performProjectAdd,
    performProjectRemove,
    performProjectSwitch,
    projectSwitchState.pendingAction,
    t,
  ]);

  const handleChangeSyncId = useCallback((id, currentSyncId) => {
    setSyncIdEditorState({
      open: true,
      projectId: id,
      value: currentSyncId ?? "",
    });
  }, []);

  const updateSyncIdEditorValue = useCallback((value) => {
    setSyncIdEditorState((state) => ({ ...state, value }));
  }, []);
  const cancelSyncIdEditor = useCallback(() => {
    setSyncIdEditorState(CLOSED_SYNC_ID_EDITOR);
  }, []);
  const confirmSyncIdEditor = useCallback(() => {
    if (!syncIdEditorState.projectId) return;

    const normalized = syncIdEditorState.value.trim().toLowerCase();
    if (normalized.length < 8) {
      notify("warning", t("settings.syncidMustBeAt"));
      return;
    }

    const updated = replaceProjectSyncId(
      syncIdEditorState.projectId,
      normalized,
    );
    notify(
      updated ? "success" : "error",
      updated
        ? t("settings.projectSyncidUpdated")
        : t("settings.couldNotUpdateProject"),
    );
    if (updated) setSyncIdEditorState(CLOSED_SYNC_ID_EDITOR);
  }, [notify, replaceProjectSyncId, syncIdEditorState, t]);
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
    handleChangeSyncId,
    syncIdEditorState: {
      ...syncIdEditorState,
      title: t("settings.changeProjectSyncid"),
      description: t("settings.theCurrentSyncidIs"),
      confirmLabel: t("settings.save"),
      cancelLabel: t("settings.cancel"),
      inputLabel: "syncId",
    },
    updateSyncIdEditorValue,
    confirmSyncIdEditor,
    cancelSyncIdEditor,
    restoreProjectMetadata,
    restoreProjectSnapshot,
    ensureProjectSyncId,
  };
}
