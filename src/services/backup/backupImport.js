import { appError } from "@/utils/appError";
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
import { collectPhotoOwners } from "@/services/storage/photoOwners";
import { restorePhotos } from "./photoRestore";
import {
  resolveMonitoringRound,
  readStoredProjectVars,
  recalculateLeaks,
} from "./projectMeta";
import { waitForPhotoStorage, waitForProjectActivation } from "./runtime";
import {
  assertProjectTypesMatch,
  resolveIncomingApplication,
  resolveSyncIdDecision,
} from "./backupImportGuards";
import {
  restoreProjectComponents,
  restoreProjectSchemas,
} from "./projectExtrasRestore";
import { ignoredError } from "@/utils/ignoredError";
import { asError } from "@/utils/appError";

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
    throw appError(
      "ARCHIVE_NO_PROJECT_META",
      "Архив не содержит метаданных проекта. Заполните название и тип проекта.",
    );
  }

  const previousProjectId = activeProjectIdRef?.current ?? null;
  const newProject = meta?.project?.syncId
    ? addProject(projectName, projectType, {
        syncId: meta.project.syncId,
      })
    : addProject(projectName, projectType);
  if (!newProject) {
    throw appError("PROJECT_CREATE_FAILED", "Не удалось создать проект");
  }

  try {
    await waitForProjectActivation(activeProjectIdRef, newProject.id);
    await waitForPhotoStorage(photoReadyRef);
    const savePhotoToImportedProject = savePhotoRef?.current;
    const saveImportedProject = saveRef?.current;
    if (
      typeof savePhotoToImportedProject !== "function" ||
      typeof saveImportedProject !== "function"
    ) {
      throw appError(
        "IMPORT_STORAGE_NOT_READY",
        "Хранилище импортируемого проекта не готово",
      );
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

  assertProjectTypesMatch(meta, existingProject);
  const { shouldAdoptSyncId, shouldReplaceSyncId } = resolveSyncIdDecision({
    mode,
    isSync,
    incomingMeta: meta,
    existingProject,
    setProjectSyncId,
    replaceProjectSyncId,
  });
  const incomingSyncId = meta?.project?.syncId?.trim().toLowerCase() || null;

  const localSyncState = await readProjectSyncStateAsync(existingProjectId);
  const localSettings = readProjectSettings(existingProjectId);
  const localMonitoringRound = readMonitoringRound(existingProjectId);
  const localVarsRaw = localStorage.getItem(
    STORAGE_KEYS.PROJECT_VARS(existingProjectId),
  );
  const {
    incomingSyncState,
    incomingSettings,
    shouldApplyIncomingVars,
    shouldApplyIncomingSettings,
    vars,
  } = resolveIncomingApplication({
    mode,
    isSync,
    incomingMeta: meta,
    localSettings,
    localSyncState,
    localVars: readStoredProjectVars(existingProjectId),
    shouldApplyIncomingProjectSettings,
  });
  if (isSync && incomingSyncState) {
    assertProjectSyncStateCompatible(localSyncState, incomingSyncState);
  }
  const mergedSyncState = mergeProjectSyncStates(
    localSyncState,
    incomingSyncState,
  );

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
  let nextMonitoringRound = /** @type {Record<string, any>|null} */ (null);
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
        nextMonitoringRound = resolveMonitoringRound(
          readMonitoringRound(existingProjectId),
          getRestoredMonitoringRound(meta, finalLeaks),
        );
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
        throw shouldReplaceSyncId
          ? appError(
              "SYNC_ID_REPLACE_FAILED",
              "Не удалось заменить идентификатор синхронизации",
            )
          : appError(
              "SYNC_ID_SAVE_FAILED",
              "Не удалось сохранить идентификатор синхронизации",
            );
      }
    }
  } catch (caught) {
    // Откат оставляет след на самой ошибке, а писать поля можно только
    // объекту — см. `asError`.
    const error = asError(caught);
    const rollbackErrors = /** @type {unknown[]} */ ([]);
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

    await PhotoRepository.gcOrphaned(
      () => collectPhotoOwners(existingProject, existingForStorage),
      { projectId: existingProjectId, folderName: existingFolderName },
    ).catch(ignoredError("backupImport.gcOrphanedPhotos"));
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
  //
  // Cards count as photo owners too, and the registry was restored two lines
  // up: collecting against the leaks alone deleted those pictures the moment
  // they arrived, which is how two phones exchanging databases lost the
  // photographs of their walks.
  await PhotoRepository.gcOrphaned(
    () =>
      collectPhotoOwners(existingProject, [
        ...finalLeaks,
        ...preservedExisting,
      ]),
    { projectId: existingProjectId, folderName: existingFolderName },
  ).catch((error) => {
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
