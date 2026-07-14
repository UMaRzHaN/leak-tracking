import { useEffect, useState, useCallback } from "react";
import { isNative } from "@/utils/platform";
import { useProjectData } from "@/app/project/ProjectContext";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { idb } from "@/repositories/idb";

export function usePhotoStorage() {
  const { activeProject } = useProjectData();
  const [ready, setReady] = useState(() => isNative || idb.getState().ready);

  useEffect(() => {
    if (isNative) {
      setReady(true);
      return undefined;
    }

    setReady(idb.getState().ready);
    const unsub = idb.subscribe((_, r) => setReady(r));
    idb.open();
    return unsub;
  }, []);

  useEffect(() => {
    if (!isNative || !activeProject?.folderName) return;
    PhotoRepository.prepare({
      folderName: activeProject.folderName,
    }).catch(() => {});
  }, [activeProject?.folderName]);

  const savePhoto = useCallback(
    async (rawPhoto, leakId, excludePaths = [], options = {}) => {
      return PhotoRepository.save(
        rawPhoto,
        {
          projectId: activeProject?.id,
          leakId,
          folderName: activeProject?.folderName,
        },
        excludePaths,
        options,
      );
    },
    [activeProject?.id, activeProject?.folderName],
  );

  const deletePhoto = useCallback(
    async (path) => PhotoRepository.delete(path),
    [],
  );

  const getPhoto = useCallback(async (id) => PhotoRepository.get(id), []);

  const gcOrphanedPhotos = useCallback(
    async (leaks) => {
      await PhotoRepository.gcOrphaned(leaks, {
        projectId: activeProject?.id,
        folderName: activeProject?.folderName,
      });
    },
    [activeProject?.id, activeProject?.folderName],
  );

  return {
    ready,
    isNative,
    savePhoto,
    deletePhoto,
    getPhoto,
    gcOrphanedPhotos,
  };
}
