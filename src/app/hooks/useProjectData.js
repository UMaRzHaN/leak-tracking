import { useEffect, useState, useCallback, useRef } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import {
  LeakRepository,
  getEmbeddedProjectSyncState,
  getPreservedInvalidLeakRecords,
  getProjectDataReadWarning,
} from "@/repositories/LeakRepository";
import { splitProjectDataReadWarning } from "@/repositories/projectDataReadState";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  commitLeakDataMutation,
  restoreEmbeddedProjectSyncState,
} from "@/services/sync/projectSyncState";
import { stampLeakFieldVersions } from "@/services/storage/leakFieldVersions";
import { logger } from "@/utils/logger";

export function useProjectData() {
  const { activeProject } = useProjectDataCtx();
  const activeProjectId = activeProject?.id ?? null;
  const activeProjectFolderName = activeProject?.folderName ?? null;
  const activeProjectLegacyStorageType =
    activeProject?.legacyStorageType ?? null;

  const [data, setData] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataProjectId, setDataProjectId] = useState(null);
  const [preservedRecords, setPreservedRecords] = useState([]);

  const [loadError, setLoadError] = useState(null);
  const [loadWarning, setLoadWarning] = useState(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const saveQueueRef = useRef(Promise.resolve());
  const dataRef = useRef([]);
  const dataProjectIdRef = useRef(null);
  const loadGenerationRef = useRef(0);
  const persistedByProjectRef = useRef(new Map());
  const committedDataByProjectRef = useRef(new Map());
  const committedPreservedByProjectRef = useRef(new Map());
  const writeGenerationByProjectRef = useRef(new Map());
  const loadErrorRef = useRef(null);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  useEffect(() => {
    const loadGeneration = ++loadGenerationRef.current;
    setDataLoaded(false);
    setLoadError(null);
    setLoadWarning(null);
    loadErrorRef.current = null;

    if (!activeProjectId || !activeProjectFolderName) {
      setData([]);
      dataRef.current = [];
      dataProjectIdRef.current = activeProjectId;
      setDataLoaded(true);
      setDataProjectId(activeProjectId);
      setPreservedRecords([]);
      setLoadWarning(null);
      return;
    }

    let cancelled = false;

    LeakRepository.getAll({
      projectId: activeProjectId,
      folderName: activeProjectFolderName,
      ...(activeProjectLegacyStorageType
        ? { legacyStorageType: activeProjectLegacyStorageType }
        : {}),
    })
      .then(async (result) => {
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        const preserved = getPreservedInvalidLeakRecords?.(result) ?? [];
        const readWarning = getProjectDataReadWarning?.(result) ?? null;
        const { loadError: blockingWarning, loadWarning: nonBlockingWarning } =
          splitProjectDataReadWarning(readWarning);
        await restoreEmbeddedProjectSyncState(
          activeProjectId,
          getEmbeddedProjectSyncState?.(result),
          [...result, ...preserved],
        );
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        setPreservedRecords(preserved);
        setLoadWarning(nonBlockingWarning);
        setLoadError(blockingWarning);
        loadErrorRef.current = blockingWarning;
        persistedByProjectRef.current.set(activeProjectId, [
          ...result,
          ...preserved,
        ]);
        committedDataByProjectRef.current.set(activeProjectId, result);
        committedPreservedByProjectRef.current.set(activeProjectId, preserved);
        setData(result);
        dataRef.current = result;
        dataProjectIdRef.current = activeProjectId;
        setDataLoaded(true);
        setDataProjectId(activeProjectId);
      })
      .catch((error) => {
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        logger.error("[useProjectData] Failed to load project data:", error);
        setLoadError(error);
        setLoadWarning(null);
        loadErrorRef.current = error;
        setPreservedRecords([]);
        persistedByProjectRef.current.delete(activeProjectId);
        committedDataByProjectRef.current.delete(activeProjectId);
        committedPreservedByProjectRef.current.delete(activeProjectId);
        setData([]);
        dataRef.current = [];
        dataProjectIdRef.current = activeProjectId;
        setDataLoaded(true);
        setDataProjectId(activeProjectId);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectFolderName,
    activeProjectId,
    activeProjectLegacyStorageType,
    reloadRevision,
  ]);

  const save = useCallback(
    /**
     * @param {any[]} next
     * @param {{optimistic?: boolean, preservedRecords?: any[]}} [options]
     */
    (
      next,
      { optimistic = true, preservedRecords: requestedPreserved } = {},
    ) => {
      const projectId = activeProjectId;
      const folderName = activeProjectFolderName;
      const isActiveProject = () => activeProjectIdRef.current === projectId;
      if (isActiveProject() && loadErrorRef.current) {
        const error = new Error(
          "Project data is read-only after a load failure",
          {
            cause: loadErrorRef.current,
          },
        );
        error.code = "PROJECT_DATA_WRITE_BLOCKED";
        return Promise.reject(error);
      }
      // A save can happen while the initial repository read is still pending
      // (notably when importing Excel into the first project). Invalidate that
      // read so its stale empty result cannot replace the imported records.
      if (isActiveProject()) loadGenerationRef.current += 1;
      const previous =
        dataProjectIdRef.current === projectId
          ? dataRef.current
          : (committedDataByProjectRef.current.get(projectId) ?? []);
      const writeGeneration = projectId
        ? (writeGenerationByProjectRef.current.get(projectId) ?? 0) + 1
        : 0;
      if (projectId) {
        writeGenerationByProjectRef.current.set(projectId, writeGeneration);
      }
      const previousPreserved =
        dataProjectIdRef.current === projectId
          ? preservedRecords
          : (committedPreservedByProjectRef.current.get(projectId) ?? []);
      const hasRequestedPreserved = Array.isArray(requestedPreserved);
      const nextPreserved = hasRequestedPreserved
        ? requestedPreserved
        : previousPreserved;
      const versionedNext = stampLeakFieldVersions(previous, next);
      const recordsToPersist = [...versionedNext, ...nextPreserved];
      const publishLocalState = () => {
        if (!isActiveProject()) return;
        dataRef.current = versionedNext;
        dataProjectIdRef.current = projectId;
        setData(() => versionedNext);
        setPreservedRecords(nextPreserved);
        setDataLoaded(true);
        setDataProjectId(projectId);
      };
      if (optimistic) publishLocalState();
      if (!projectId || !folderName) {
        if (!optimistic) publishLocalState();
        return Promise.resolve();
      }
      const nextSave = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const persistedBefore = persistedByProjectRef.current.get(
            projectId,
          ) ?? [...previous, ...previousPreserved];
          try {
            await commitLeakDataMutation(
              projectId,
              persistedBefore,
              recordsToPersist,
              (syncState) =>
                LeakRepository.saveAll(recordsToPersist, {
                  projectId,
                  folderName,
                  syncState,
                  previousLeaks: persistedBefore,
                }),
            );
          } catch (error) {
            if (
              optimistic &&
              dataProjectIdRef.current === projectId &&
              dataRef.current === versionedNext
            ) {
              const committed =
                committedDataByProjectRef.current.get(projectId) ?? previous;
              dataRef.current = committed;
              setData(committed);
              setPreservedRecords(
                committedPreservedByProjectRef.current.get(projectId) ??
                  previousPreserved,
              );
            }
            throw error;
          }
          persistedByProjectRef.current.set(projectId, recordsToPersist);
          committedDataByProjectRef.current.set(projectId, versionedNext);
          committedPreservedByProjectRef.current.set(projectId, nextPreserved);
          if (
            !optimistic &&
            isActiveProject() &&
            writeGenerationByProjectRef.current.get(projectId) ===
              writeGeneration
          ) {
            publishLocalState();
          }
        });
      saveQueueRef.current = nextSave;
      return nextSave;
    },
    [activeProjectFolderName, activeProjectId, preservedRecords],
  );

  const clear = useCallback(() => {
    const projectId = activeProjectId;
    const folderName = activeProjectFolderName;
    const isActiveProject = () => activeProjectIdRef.current === projectId;
    if (isActiveProject() && loadErrorRef.current) {
      const error = new Error(
        "Project data is read-only after a load failure",
        {
          cause: loadErrorRef.current,
        },
      );
      error.code = "PROJECT_DATA_WRITE_BLOCKED";
      return Promise.reject(error);
    }
    if (isActiveProject()) {
      loadGenerationRef.current += 1;
    }
    const writeGeneration = projectId
      ? (writeGenerationByProjectRef.current.get(projectId) ?? 0) + 1
      : 0;
    if (projectId) {
      writeGenerationByProjectRef.current.set(projectId, writeGeneration);
    }
    const previous =
      dataProjectIdRef.current === projectId
        ? dataRef.current
        : (committedDataByProjectRef.current.get(projectId) ?? []);
    const previousPreserved =
      dataProjectIdRef.current === projectId
        ? preservedRecords
        : (committedPreservedByProjectRef.current.get(projectId) ?? []);
    const clearedData = [];
    if (isActiveProject()) {
      dataRef.current = clearedData;
      dataProjectIdRef.current = projectId;
      setData(clearedData);
      setPreservedRecords([]);
      setDataLoaded(true);
      setDataProjectId(projectId);
    }
    if (!projectId || !folderName) {
      return Promise.resolve();
    }
    const nextClear = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const persistedBefore = persistedByProjectRef.current.get(
            projectId,
          ) ?? [...previous, ...previousPreserved];
          await commitLeakDataMutation(
            projectId,
            persistedBefore,
            [],
            (syncState) =>
              LeakRepository.clear({ projectId, folderName, syncState }),
          );
        } catch (error) {
          if (
            dataProjectIdRef.current === projectId &&
            dataRef.current === clearedData &&
            writeGenerationByProjectRef.current.get(projectId) ===
              writeGeneration
          ) {
            const committed =
              committedDataByProjectRef.current.get(projectId) ?? previous;
            dataRef.current = committed;
            setData(committed);
            setPreservedRecords(previousPreserved);
          }
          throw error;
        }
        persistedByProjectRef.current.set(projectId, []);
        committedDataByProjectRef.current.set(projectId, []);
        committedPreservedByProjectRef.current.set(projectId, []);
        try {
          await PhotoRepository.gcOrphaned([], { projectId, folderName });
        } catch (error) {
          logger.error(
            "[useProjectData] Data was cleared, but orphaned photos could not be removed:",
            error,
          );
        }
      });
    saveQueueRef.current = nextClear;
    return nextClear;
  }, [activeProjectFolderName, activeProjectId, preservedRecords]);

  const retryLoad = useCallback(() => {
    setReloadRevision((value) => value + 1);
  }, []);

  const dataForPhotoGc = preservedRecords.length
    ? [...data, ...preservedRecords]
    : data;

  return {
    data,
    setData,
    dataForPhotoGc,
    save,
    clear,
    dataLoaded: dataLoaded && dataProjectId === activeProjectId,
    dataProjectId,
    loadError,
    loadWarning,
    retryLoad,
    canWrite: !loadError,
  };
}
