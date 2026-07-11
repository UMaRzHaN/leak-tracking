import { useEffect, useState, useCallback, useRef } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import { LeakRepository } from "@/repositories/LeakRepository";
import { logger } from "@/utils/logger";

export function useProjectData() {
  const { activeProject } = useProjectDataCtx();
  const activeProjectId = activeProject?.id ?? null;
  const activeProjectFolderName = activeProject?.folderName ?? null;

  const [data, setData] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataProjectId, setDataProjectId] = useState(null);

  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    setDataLoaded(false);

    if (!activeProjectId || !activeProjectFolderName) {
      setData([]);
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
        if (cancelled) return;
        setData(result);
        setDataLoaded(true);
        setDataProjectId(activeProjectId);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error("[useProjectData] Failed to load project data:", error);
        setData([]);
        setDataLoaded(true);
        setDataProjectId(activeProjectId);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectFolderName, activeProjectId]);

  const save = useCallback(
    (next) => {
      setData(() => next);
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

  const clear = useCallback(async () => {
    setData([]);
    if (!activeProjectId || !activeProjectFolderName) return;
    await LeakRepository.clear({
      projectId: activeProjectId,
      folderName: activeProjectFolderName,
    });
  }, [activeProjectFolderName, activeProjectId]);

  return { data, setData, save, clear, dataLoaded, dataProjectId };
}
