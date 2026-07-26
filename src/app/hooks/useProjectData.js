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
  const loadErrorRef = useRef(null);

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
    })
      .then((result) => {
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        const preserved = getPreservedInvalidLeakRecords?.(result) ?? [];
        setPreservedRecords(preserved);
        persistedByProjectRef.current.set(activeProjectId, [
          ...result,
          ...preserved,
        ]);
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
        setData([]);
        dataRef.current = [];
        dataProjectIdRef.current = activeProjectId;
        setDataLoaded(true);
        setDataProjectId(activeProjectId);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectFolderName, activeProjectId, reloadRevision]);

  const save = useCallback(
    (next) => {
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
      const preserved =
        dataProjectIdRef.current === projectId ? preservedRecords : [];
      const versionedNext = stampLeakFieldVersions(previous, next);
      const recordsToPersist = [...versionedNext, ...preserved];
      dataRef.current = versionedNext;
      dataProjectIdRef.current = activeProjectId;
      setData(() => versionedNext);
      setDataLoaded(true);
      setDataProjectId(activeProjectId);
      if (!projectId || !folderName) return Promise.resolve();
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
              dataProjectIdRef.current === projectId &&
              dataRef.current === versionedNext
            ) {
              dataRef.current = previous;
              setData(previous);
            }
            throw error;
          }
          persistedByProjectRef.current.set(projectId, recordsToPersist);
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
    const previous = dataRef.current;
    const previousPreserved = preservedRecords;
    dataRef.current = [];
    dataProjectIdRef.current = projectId;
    setData([]);
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
            dataRef.current.length === 0
          ) {
            dataRef.current = previous;
            setData(previous);
            setPreservedRecords(previousPreserved);
          }
          throw error;
        }
        const persistedBefore = persistedByProjectRef.current.get(
          projectId,
        ) ?? [...previous, ...previousPreserved];
        persistedByProjectRef.current.set(projectId, []);
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
