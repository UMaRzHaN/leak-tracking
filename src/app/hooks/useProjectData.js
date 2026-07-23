import { useEffect, useState, useCallback, useRef } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import { LeakRepository } from "@/repositories/LeakRepository";
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

  const saveQueue = useRef(Promise.resolve());
  const dataRef = useRef([]);
  const dataProjectIdRef = useRef(null);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    const loadGeneration = ++loadGenerationRef.current;
    setDataLoaded(false);

    if (!activeProjectId || !activeProjectFolderName) {
      setData([]);
      dataRef.current = [];
      dataProjectIdRef.current = null;
      setDataLoaded(true);
      setDataProjectId(null);
      return;
    }

    let cancelled = false;

    LeakRepository.getAll({
      projectId: activeProjectId,
      folderName: activeProjectFolderName,
    })
      .then((result) => {
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        setData(result);
        dataRef.current = result;
        dataProjectIdRef.current = activeProjectId;
        setDataLoaded(true);
        setDataProjectId(activeProjectId);
      })
      .catch((error) => {
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        logger.error("[useProjectData] Failed to load project data:", error);
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
      recordLeakDeletions(activeProjectId, previous, next);
      dataRef.current = next;
      dataProjectIdRef.current = activeProjectId;
      setData(() => next);
      setDataLoaded(true);
      setDataProjectId(activeProjectId);
      if (!activeProjectId || !activeProjectFolderName)
        return Promise.resolve();
      const nextSave = saveQueue.current
        .catch(() => undefined)
        .then(() =>
          LeakRepository.saveAll(next, {
            projectId: activeProjectId,
            folderName: activeProjectFolderName,
          }),
        );
      saveQueue.current = nextSave;
      return nextSave;
    },
    [activeProjectFolderName, activeProjectId],
  );

  const clear = useCallback(() => {
    loadGenerationRef.current += 1;
    recordLeakDeletions(activeProjectId, dataRef.current, []);
    dataRef.current = [];
    dataProjectIdRef.current = activeProjectId;
    setData([]);
    setDataLoaded(true);
    setDataProjectId(activeProjectId);
    if (!activeProjectId || !activeProjectFolderName) {
      return Promise.resolve();
    }
    const nextClear = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        await LeakRepository.clear({
          projectId: activeProjectId,
          folderName: activeProjectFolderName,
        });
        await PhotoRepository.gcOrphaned([], {
          projectId: activeProjectId,
          folderName: activeProjectFolderName,
        });
      });
    saveQueue.current = nextClear;
    return nextClear;
  }, [activeProjectFolderName, activeProjectId]);

  return { data, setData, save, clear, dataLoaded, dataProjectId };
}
