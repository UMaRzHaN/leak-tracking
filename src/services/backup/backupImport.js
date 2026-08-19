import { STORAGE_KEYS } from "@/app/project/storageKeys";
import {
  clearProjectSettings,
  readProjectSettings,
  shouldApplyIncomingProjectSettings,
  writeProjectSettings,
} from "@/app/project/projectSettings";
import {
  LeakRepository,
  getPreservedInvalidLeakRecords,
} from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { rollbackImportedProject } from "@/services/backup/projectCleanup";
import {
  applyProjectTombstones,
  assertProjectSyncStateCompatible,
  clearProjectSyncState,
  mergeProjectSyncStates,
  readProjectSyncState,
  readProjectSyncStateAsync,
  writeProjectSyncState,
} from "@/services/sync/projectSyncState";
import {
  getRestoredMonitoringRound,
  readMonitoringRound,
  saveMonitoringRound,
} from "@/utils/monitoringRound";
import { logger } from "@/utils/logger";
import { openArchive } from "./backupArchiveSession";
import { filterIncomingLeaksForMerge, mergeLeaksByFreshness } from "./merge";
import { restorePhotos } from "./photoArchive";
import {
  monitoringRoundFreshness,
  readStoredProjectVars,
  recalculateLeaks,
} from "./projectMeta";
import { delay } from "./runtime";

async function waitForProjectActivation(activeProjectIdRef, projectId) {
  for (let i = 0; i < 60; i++) {
    if (activeProjectIdRef.current === projectId) return;
    await delay(50);
  }

  throw new Error("Таймаут переключения проекта");
}

async function waitForPhotoStorage(photoReadyRef) {
  if (!photoReadyRef) return;

  for (let i = 0; i < 60; i++) {
    if (photoReadyRef.current) return;
    await delay(50);
  }

  throw new Error("Хранилище фото не готово");
}

/**
 * Restores the archive's technological schemas into a freshly imported
 * project. Never throws: losing the drawings is a nuisance the operator can
 * fix by loading them again, while failing the import here would discard a
 * project that already came across correctly.
 */
async function restoreProjectSchemas(file, project) {
  try {
    const { restoreSchemasFromArchive } =
      await import("@/services/backup/schemaArchive");
    return await restoreSchemasFromArchive(file, project);
  } catch (error) {
    logger.warn("[projectBackupService] Could not restore schemas:", error);
    return { restored: 0, skipped: 0 };
  }
}

/**
 * Merges the archive's component registry into the imported project. Like the
 * schemas, kept outside the leak rollback: an archive that carried the leaks
 * across correctly must not be discarded because the registry would not merge.
 */
async function restoreProjectComponents(file, project) {
  try {
    const { restoreComponentsFromArchive } =
      await import("@/services/backup/componentArchive");
    return await restoreComponentsFromArchive(file, project);
  } catch (error) {
    logger.warn("[projectBackupService] Could not merge components:", error);
    return { added: 0, updated: 0, conflicts: 0 };
  }
}

export async function importProjectZip(file, ctx) {
  const {
    addProject,
    removeProject,
    savePhotoRef,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    metaFallback,
    overwriteProject,
    selectProject,
  } = ctx;

  const { photos, leaks, meta, recoveryRecords } = await openArchive(file);

  const projectName =
    ctx.overrideName?.trim() || meta?.project?.name || metaFallback?.name;
  const projectType = meta?.project?.type || metaFallback?.type;

  if (!projectName || !projectType) {
    throw new Error(
      "Архив не содержит метаданных проекта. Заполните название и тип проекта.",
    );
  }

  const previousProjectId = activeProjectIdRef?.current ?? null;
  const newProject = meta?.project?.syncId
    ? addProject(projectName, projectType, {
        syncId: meta.project.syncId,
      })
    : addProject(projectName, projectType);
  if (!newProject) throw new Error("Не удалось создать проект");

  try {
    await waitForProjectActivation(activeProjectIdRef, newProject.id);
    await waitForPhotoStorage(photoReadyRef);
    const savePhotoToImportedProject = savePhotoRef?.current;
    const saveImportedProject = saveRef?.current;
    if (
      typeof savePhotoToImportedProject !== "function" ||
      typeof saveImportedProject !== "function"
    ) {
      throw new Error("Хранилище импортируемого проекта не готово");
    }

    if (meta?.vars) {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(newProject.id),
        JSON.stringify(meta.vars),
      );
    }
    if (meta?.settings) {
      writeProjectSettings(newProject.id, meta.settings);
    }
    const importedProject = newProject;
    if (meta?.sync) {
      await writeProjectSyncState(newProject.id, meta.sync, []);
    }

    const restoredLeaks = await restorePhotos(
      leaks,
      photos,
      savePhotoToImportedProject,
    );
    const finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
    const restoredRecoveryRecords = await restorePhotos(
      recoveryRecords,
      photos,
      savePhotoToImportedProject,
      { keyPrefix: "recovery_" },
    );
    saveMonitoringRound(
      newProject.id,
      getRestoredMonitoringRound(meta, finalLeaks),
    );
    await saveImportedProject(finalLeaks, {
      preservedRecords: restoredRecoveryRecords,
    });

    await writeProjectSyncState(newProject.id, meta?.sync, finalLeaks);

    // Drawings travel in a folder of their own and are restored in a separate
    // pass — see schemaArchive for why. Deliberately after the leak data is
    // committed and outside its rollback: a project that arrived intact must
    // not be thrown away because one drawing would not store, and the operator
    // can always load that drawing again by hand.
    const schemaResult = await restoreProjectSchemas(file, importedProject);
    const componentResult = await restoreProjectComponents(
      file,
      importedProject,
    );

    return {
      project: importedProject,
      leakCount: finalLeaks.length,
      schemaCount: schemaResult.restored,
      componentCount: componentResult.added,
      componentConflicts: componentResult.conflicts,
    };
  } catch (error) {
    try {
      await rollbackImportedProject(newProject, removeProject);
    } finally {
      const restoreProject = overwriteProject ?? selectProject;
      if (
        previousProjectId &&
        previousProjectId !== newProject.id &&
        typeof restoreProject === "function"
      ) {
        try {
          restoreProject(previousProjectId);
        } catch (restoreError) {
          logger.warn(
            "[projectBackupService] Import rollback could not restore the previous active project:",
            restoreError,
          );
        }
      }
    }
    throw error;
  }
}

export async function importIntoExistingProject(zipFile, ctx, mode) {
  const {
    overwriteProject,
    saveRef,
    activeProjectIdRef,
    photoReadyRef,
    existingProject,
    setProjectSyncId,
    replaceProjectSyncId,
    restoreProjectSnapshot,
  } = ctx;

  const { id: existingProjectId, folderName: existingFolderName } =
    existingProject;
  const { photos, leaks, meta } = await openArchive(zipFile);

  const isSync = mode === "sync";
  const isMerge = mode === "merge" || isSync;
  const incomingProjectType =
    typeof meta?.project?.type === "string"
      ? meta.project.type.trim().toLowerCase()
      : null;
  const existingProjectType =
    typeof existingProject.type === "string"
      ? existingProject.type.trim().toLowerCase()
      : null;

  if (!incomingProjectType) {
    const error = new Error(
      "Не удалось определить тип проекта в импортируемом архиве",
    );
    error.code = "PROJECT_TYPE_MISSING";
    error.existingProjectType = existingProjectType;
    throw error;
  }

  if (!existingProjectType) {
    const error = new Error("Не удалось определить тип текущего проекта");
    error.code = "CURRENT_PROJECT_TYPE_MISSING";
    error.incomingProjectType = incomingProjectType;
    throw error;
  }

  if (incomingProjectType !== existingProjectType) {
    const error = new Error(
      "Тип импортируемого проекта не соответствует текущему проекту",
    );
    error.code = "PROJECT_TYPE_MISMATCH";
    error.incomingProjectType = incomingProjectType;
    error.existingProjectType = existingProjectType;
    throw error;
  }

  const incomingSyncId = meta?.project?.syncId?.trim().toLowerCase() || null;
  const existingSyncId = existingProject.syncId?.trim().toLowerCase() || null;
  if (
    isSync &&
    existingSyncId &&
    incomingSyncId &&
    incomingSyncId !== existingSyncId
  ) {
    throw new Error("Архив получен из другой базы данных");
  }
  if (isSync && !existingSyncId && !incomingSyncId) {
    throw new Error("Архив не содержит идентификатор синхронизации");
  }
  const shouldAdoptSyncId = isSync && !existingSyncId && incomingSyncId;
  const shouldReplaceSyncId =
    mode === "overwrite" &&
    Boolean(incomingSyncId) &&
    incomingSyncId !== existingSyncId;
  if (shouldAdoptSyncId && typeof setProjectSyncId !== "function") {
    throw new Error("Не удалось сохранить идентификатор синхронизации");
  }
  if (shouldReplaceSyncId && typeof replaceProjectSyncId !== "function") {
    throw new Error("Не удалось заменить идентификатор синхронизации");
  }

  const localSyncState = await readProjectSyncStateAsync(existingProjectId);
  const incomingSyncState = meta?.sync;
  if (isSync && incomingSyncState) {
    assertProjectSyncStateCompatible(localSyncState, incomingSyncState);
  }
  const mergedSyncState = mergeProjectSyncStates(
    localSyncState,
    incomingSyncState,
  );
  const shouldApplyIncomingVars =
    isSync &&
    meta?.vars &&
    (incomingSyncState?.varsUpdatedAt ?? 0) > localSyncState.varsUpdatedAt;
  const localSettings = readProjectSettings(existingProjectId);
  const localMonitoringRound = readMonitoringRound(existingProjectId);
  const localVarsRaw = localStorage.getItem(
    STORAGE_KEYS.PROJECT_VARS(existingProjectId),
  );
  const incomingSettings = meta?.settings ?? null;
  const hasIncomingSettings = Boolean(incomingSettings);
  const shouldApplyIncomingSettings =
    mode === "overwrite" ||
    (hasIncomingSettings &&
      mode === "merge" &&
      incomingSettings.updatedAt > localSettings.updatedAt) ||
    (hasIncomingSettings &&
      isSync &&
      shouldApplyIncomingProjectSettings(localSettings, incomingSettings));

  let vars = null;
  if (mode === "overwrite") {
    vars = meta?.vars ?? null;
  }

  await waitForPhotoStorage(photoReadyRef);
  const existing = await LeakRepository.getAll({
    projectId: existingProjectId,
    folderName: existingFolderName,
    ...(existingProject.legacyStorageType
      ? { legacyStorageType: existingProject.legacyStorageType }
      : {}),
  });
  const preservedExisting = getPreservedInvalidLeakRecords(existing);
  const existingForStorage = [...existing, ...preservedExisting];

  // The selected archive can target a project other than the currently active
  // one. Using savePhotoRef here would bind restored photos to the active
  // project's id/folder and make them eligible for deletion by its photo GC.
  const savePhotoToExistingProject = (
    rawPhoto,
    leakId,
    excludePaths = [],
    options = {},
  ) =>
    PhotoRepository.save(
      rawPhoto,
      {
        projectId: existingProjectId,
        leakId,
        folderName: existingFolderName,
      },
      excludePaths,
      options,
    );

  let finalLeaks;
  let addedCount;
  let nextMonitoringRound = null;
  let committedProject = existingProject;
  let dataCommitAttempted = false;
  let syncIdMutationAttempted = false;

  try {
    if (isMerge) {
      const incomingToApply = filterIncomingLeaksForMerge(
        existing,
        isSync ? applyProjectTombstones(leaks, mergedSyncState) : leaks,
        isSync ? { source: "sync" } : { source: "archive" },
      );
      const restoredIncoming = await restorePhotos(
        incomingToApply,
        photos,
        savePhotoToExistingProject,
      );
      const effectiveVars = shouldApplyIncomingVars
        ? meta?.vars
        : readStoredProjectVars(existingProjectId);
      const recalculatedIncoming = recalculateLeaks(
        restoredIncoming,
        effectiveVars,
      );
      const mergeResult = mergeLeaksByFreshness(
        existing,
        recalculatedIncoming,
        isSync ? { source: "sync" } : { source: "archive" },
      );
      finalLeaks = isSync
        ? applyProjectTombstones(mergeResult.leaks, mergedSyncState)
        : mergeResult.leaks;
      addedCount =
        mergeResult.changed + (mergeResult.leaks.length - finalLeaks.length);
      if (isSync) {
        const currentRound = readMonitoringRound(existingProjectId);
        const incomingRound = getRestoredMonitoringRound(meta, finalLeaks);
        nextMonitoringRound =
          monitoringRoundFreshness(incomingRound) >
          monitoringRoundFreshness(currentRound)
            ? incomingRound
            : currentRound;
      }
    } else {
      const restoredLeaks = await restorePhotos(
        leaks,
        photos,
        savePhotoToExistingProject,
      );
      finalLeaks = recalculateLeaks(restoredLeaks, meta?.vars);
      addedCount = finalLeaks.length;
      nextMonitoringRound = getRestoredMonitoringRound(meta, finalLeaks);
    }

    // Apply metadata before committing leak data. If the commit fails, restore
    // the captured project snapshot so the import remains all-or-nothing.
    if (mode === "overwrite") {
      if (vars) {
        localStorage.setItem(
          STORAGE_KEYS.PROJECT_VARS(existingProjectId),
          JSON.stringify(vars),
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(existingProjectId));
      }
      saveMonitoringRound(existingProjectId, nextMonitoringRound);
      if (incomingSyncState) {
        await writeProjectSyncState(
          existingProjectId,
          incomingSyncState,
          finalLeaks,
        );
      } else {
        await clearProjectSyncState(existingProjectId);
      }
    } else if (isSync) {
      if (shouldApplyIncomingVars) {
        localStorage.setItem(
          STORAGE_KEYS.PROJECT_VARS(existingProjectId),
          JSON.stringify(meta.vars),
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-vars-updated", {
              detail: { projectId: existingProjectId },
            }),
          );
        }
      }
      saveMonitoringRound(existingProjectId, nextMonitoringRound);
      await writeProjectSyncState(
        existingProjectId,
        mergeProjectSyncStates(
          readProjectSyncState(existingProjectId),
          mergedSyncState,
        ),
        finalLeaks,
      );
    }

    if (shouldApplyIncomingSettings) {
      if (incomingSettings) {
        writeProjectSettings(existingProjectId, incomingSettings);
      } else {
        clearProjectSettings(existingProjectId, { emit: true });
      }
    }

    dataCommitAttempted = true;
    if (activeProjectIdRef.current === existingProjectId) {
      await saveRef.current(finalLeaks);
    } else {
      await LeakRepository.saveAll([...finalLeaks, ...preservedExisting], {
        projectId: existingProjectId,
        folderName: existingFolderName,
      });
    }

    // Keep project metadata in the same transaction boundary as leak data.
    // If the setter fails (or mutates and then throws), the catch block below
    // restores both the exact project snapshot and the original leak set.
    if (shouldAdoptSyncId || shouldReplaceSyncId) {
      syncIdMutationAttempted = true;
      committedProject = shouldReplaceSyncId
        ? replaceProjectSyncId(existingProjectId, incomingSyncId)
        : setProjectSyncId(existingProjectId, incomingSyncId);
      if (!committedProject) {
        throw new Error(
          shouldReplaceSyncId
            ? "Не удалось заменить идентификатор синхронизации"
            : "Не удалось сохранить идентификатор синхронизации",
        );
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    if (localVarsRaw == null) {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_VARS(existingProjectId));
    } else {
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_VARS(existingProjectId),
        localVarsRaw,
      );
    }
    writeProjectSettings(existingProjectId, localSettings);
    saveMonitoringRound(existingProjectId, localMonitoringRound);
    await writeProjectSyncState(
      existingProjectId,
      localSyncState,
      existing,
    ).catch((rollbackError) => rollbackErrors.push(rollbackError));

    if (dataCommitAttempted) {
      try {
        if (activeProjectIdRef.current === existingProjectId) {
          await saveRef.current(existing);
        } else {
          await LeakRepository.saveAll(existingForStorage, {
            projectId: existingProjectId,
            folderName: existingFolderName,
          });
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (syncIdMutationAttempted) {
      if (typeof restoreProjectSnapshot !== "function") {
        rollbackErrors.push(
          new Error("Project metadata rollback is unavailable"),
        );
      } else {
        try {
          const restored = restoreProjectSnapshot(
            existingProjectId,
            existingProject,
          );
          if (!restored) {
            rollbackErrors.push(new Error("Project metadata rollback failed"));
          }
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
    }

    await PhotoRepository.gcOrphaned(existingForStorage, {
      projectId: existingProjectId,
      folderName: existingFolderName,
    }).catch(() => {});
    if (rollbackErrors.length > 0) {
      error.rollbackErrors = rollbackErrors;
      logger.error(
        "[projectBackupService] Import rollback was incomplete:",
        rollbackErrors,
      );
    }
    throw error;
  }

  // The registry and the drawings ride outside the leak transaction, and are
  // applied only once it has committed. They are the same for every route in:
  // a ZIP backup, an archive merged into an existing project, and a QR
  // exchange all arrive here, and until now only a brand-new project got them
  // — two phones syncing in the field kept their walks to themselves.
  await restoreProjectComponents(zipFile, existingProject);
  await restoreProjectSchemas(zipFile, existingProject);

  // Data is committed. Cleanup failure must not turn a successful import into
  // a false "Import error"; orphan cleanup can be retried later.
  await PhotoRepository.gcOrphaned([...finalLeaks, ...preservedExisting], {
    projectId: existingProjectId,
    folderName: existingFolderName,
  }).catch((error) => {
    logger.warn(
      "[projectBackupService] Imported data, but orphaned photos could not be removed:",
      error,
    );
  });
  if (activeProjectIdRef.current !== existingProjectId) {
    const switched = overwriteProject(existingProjectId);
    if (switched) {
      await waitForProjectActivation(
        activeProjectIdRef,
        existingProjectId,
      ).catch((error) => {
        logger.warn(
          "[projectBackupService] Data was imported, but project activation was not observed:",
          error,
        );
      });
    } else {
      logger.warn(
        "[projectBackupService] Data was imported, but the target project could not be activated.",
      );
    }
  }
  return { project: committedProject, leakCount: addedCount };
}

export async function importBackupZip(zipFile, savePhoto) {
  const { photos, leaks, meta } = await openArchive(zipFile);
  const restoredLeaks = await restorePhotos(leaks, photos, savePhoto);
  return { leaks: recalculateLeaks(restoredLeaks, meta?.vars), meta };
}
