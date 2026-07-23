import { useEffect, useState, useCallback, useRef } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import {
  LeakRepository,
  getPreservedInvalidLeakRecords,
} from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { recordLeakDeletions } from "@/services/projectSyncState";
import { logger } from "@/utils/logger";

export function useProjectData() {
  const { activeProject } = useProjectDataCtx();
  const activeProjectId = activeProject?.id ?? null;
  const activeProjectFolderName = activeProject?.folderName ?? null;

  const [data, setData] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataProjectId, setDataProjectId] = useState(null);
  const [preservedRecords, setPreservedRecords] = useState([]);

  const saveQueue = useRef(Promise.resolve());
  const dataRef = useRef([]);
  const dataProjectIdRef = useRef(null);
  const loadGenerationRef = useRef(0);
  const persistedByProjectRef = useRef(new Map());

  useEffect(() => {
    const loadGeneration = ++loadGenerationRef.current;
    setDataLoaded(false);

    if (!activeProjectId || !activeProjectFolderName) {
      setData([]);
      dataRef.current = [];
      dataProjectIdRef.current = null;
      setDataLoaded(true);
      setDataProjectId(null);
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
  }, [activeProjectFolderName, activeProjectId]);

  const save = useCallback(
    (next) => {
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
      const recordsToPersist = [...next, ...preserved];
      dataRef.current = next;
      dataProjectIdRef.current = activeProjectId;
      setData(() => next);
      setDataLoaded(true);
      setDataProjectId(activeProjectId);
      if (!projectId || !folderName) return Promise.resolve();
      const nextSave = saveQueue.current
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
              dataRef.current === next
            ) {
              dataRef.current = previous;
              setData(previous);
            }
            throw error;
          }
          persistedByProjectRef.current.set(projectId, recordsToPersist);
          try {
            recordLeakDeletions(projectId, persistedBefore, recordsToPersist);
          } catch (error) {
            logger.error(
              "[useProjectData] Data was saved, but sync metadata could not be updated:",
              error,
            );
          }
        });
      saveQueue.current = nextSave;
      return nextSave;
    },
    [activeProjectFolderName, activeProjectId, preservedRecords],
  );

  const clear = useCallback(() => {
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
    const nextClear = saveQueue.current
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
          recordLeakDeletions(projectId, persistedBefore, []);
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
    saveQueue.current = nextClear;
    return nextClear;
  }, [activeProjectFolderName, activeProjectId, preservedRecords]);

  const dataForPhotoGc = preservedRecords.length
    ? [...data, ...preservedRecords]
    : data;

  return {
    data,
    setData,
    dataForPhotoGc,
    save,
    clear,
    dataLoaded,
    dataProjectId,
  };
}
