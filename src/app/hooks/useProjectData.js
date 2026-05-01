import { useEffect, useState, useCallback } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import { LeakRepository } from "@/repositories/LeakRepository";

export function useProjectData() {
  const { activeProject } = useProjectDataCtx();

  const [data, setData] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataProjectId, setDataProjectId] = useState(null);

  useEffect(() => {
    setDataLoaded(false);

    if (!activeProject) {
      setData([]);
      setDataLoaded(true);
      setDataProjectId(null);
      return;
    }

    let cancelled = false;

    LeakRepository.getAll({
      projectId: activeProject.id,
      folderName: activeProject.folderName,
    }).then((result) => {
      if (!cancelled) {
        setData(result);
        setDataLoaded(true);
        setDataProjectId(activeProject.id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeProject?.id, activeProject?.folderName]);

  const save = useCallback(
    async (next) => {
      setData(() => next);
      if (!activeProject) return;
      await LeakRepository.saveAll(next, {
        projectId: activeProject.id,
        folderName: activeProject.folderName,
      });
    },
    [activeProject?.id, activeProject?.folderName],
  );

  const clear = useCallback(async () => {
    setData([]);
    if (!activeProject) return;
    await LeakRepository.clear({
      projectId: activeProject.id,
      folderName: activeProject.folderName,
    });
  }, [activeProject?.id, activeProject?.folderName]);

  return { data, setData, save, clear, dataLoaded, dataProjectId };
}
