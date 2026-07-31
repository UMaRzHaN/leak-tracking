import { useEffect, useState, useCallback, useRef } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import {
  LeakRepository,
  getPreservedInvalidLeakRecords,
} from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { recordLeakDeletions } from "@/services/projectSyncState";
import { stampLeakFieldVersions } from "@/services/leakFieldVersions";
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
  const [reloadRevision, setReloadRevision] = useState(0);
  const saveQueueRef = useRef(Promise.resolve());
  const dataRef = useRef([]);
  const dataProjectIdRef = useRef(null);
  const loadGenerationRef = useRef(0);
  const persistedByProjectRef = useRef(new Map());
  const committedDataByProjectRef = useRef(new Map());
  const writeGenerationByProjectRef = useRef(new Map());
  const loadErrorRef = useRef(null);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  useEffect(() => {
    const loadGeneration = ++loadGenerationRef.current;
    setDataLoaded(false);
    setLoadError(null);
    loadErrorRef.current = null;

    if (!activeProjectId || !activeProjectFolderName) {
      setData([]);
      dataRef.current = [];
      dataProjectIdRef.current = activeProjectId;
      setDataLoaded(true);
      setDataProjectId(activeProjectId);
      setPreservedRecords([]);
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
      .then((result) => {
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        const preserved = getPreservedInvalidLeakRecords?.(result) ?? [];
        setPreservedRecords(preserved);
        persistedByProjectRef.current.set(activeProjectId, [
          ...result,
          ...preserved,
        ]);
        committedDataByProjectRef.current.set(activeProjectId, result);
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
        loadErrorRef.current = error;
        setPreservedRecords([]);
        persistedByProjectRef.current.delete(activeProjectId);
        committedDataByProjectRef.current.delete(activeProjectId);
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
    (next, { optimistic = true } = {}) => {
      if (loadErrorRef.current) {
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
      loadGenerationRef.current += 1;
      const previous =
        dataProjectIdRef.current === activeProjectId ? dataRef.current : [];
      const projectId = activeProjectId;
      const folderName = activeProjectFolderName;
      const writeGeneration = projectId
        ? (writeGenerationByProjectRef.current.get(projectId) ?? 0) + 1
        : 0;
      if (projectId) {
        writeGenerationByProjectRef.current.set(projectId, writeGeneration);
      }
      const preserved =
        dataProjectIdRef.current === projectId ? preservedRecords : [];
      const versionedNext = stampLeakFieldVersions(previous, next);
      const recordsToPersist = [...versionedNext, ...preserved];
      const publishLocalState = () => {
        dataRef.current = versionedNext;
        dataProjectIdRef.current = projectId;
        setData(() => versionedNext);
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
          ) ?? [...previous, ...preserved];
          try {
            await LeakRepository.saveAll(recordsToPersist, {
              projectId,
              folderName,
            });
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
            }
            throw error;
          }
          persistedByProjectRef.current.set(projectId, recordsToPersist);
          committedDataByProjectRef.current.set(projectId, versionedNext);
          if (
            !optimistic &&
            activeProjectIdRef.current === projectId &&
            writeGenerationByProjectRef.current.get(projectId) ===
              writeGeneration
          ) {
            publishLocalState();
          }
          try {
            await recordLeakDeletions(
              projectId,
              persistedBefore,
              recordsToPersist,
            );
          } catch (error) {
            logger.error(
              "[useProjectData] Data was saved, but sync metadata could not be updated:",
              error,
            );
          }
        });
      saveQueueRef.current = nextSave;
      return nextSave;
    },
    [activeProjectFolderName, activeProjectId, preservedRecords],
  );

  const clear = useCallback(() => {
    if (loadErrorRef.current) {
      const error = new Error(
        "Project data is read-only after a load failure",
        {
          cause: loadErrorRef.current,
        },
      );
      error.code = "PROJECT_DATA_WRITE_BLOCKED";
      return Promise.reject(error);
    }
    loadGenerationRef.current += 1;
    const projectId = activeProjectId;
    const folderName = activeProjectFolderName;
    const writeGeneration = projectId
      ? (writeGenerationByProjectRef.current.get(projectId) ?? 0) + 1
      : 0;
    if (projectId) {
      writeGenerationByProjectRef.current.set(projectId, writeGeneration);
    }
    const previous = dataRef.current;
    const previousPreserved = preservedRecords;
    const clearedData = [];
    dataRef.current = clearedData;
    dataProjectIdRef.current = projectId;
    setData(clearedData);
    setPreservedRecords([]);
    setDataLoaded(true);
    setDataProjectId(projectId);
    if (!projectId || !folderName) {
      return Promise.resolve();
    }
    const nextClear = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await LeakRepository.clear({ projectId, folderName });
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
        const persistedBefore = persistedByProjectRef.current.get(
          projectId,
        ) ?? [...previous, ...previousPreserved];
        persistedByProjectRef.current.set(projectId, []);
        committedDataByProjectRef.current.set(projectId, []);
        try {
          await recordLeakDeletions(projectId, persistedBefore, []);
        } catch (error) {
          logger.error(
            "[useProjectData] Data was cleared, but sync metadata could not be updated:",
            error,
          );
        }
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
    retryLoad,
    canWrite: !loadError,
  };
}
