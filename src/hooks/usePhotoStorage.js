import { useEffect, useState, useCallback } from "react";
import { isNative } from "../utils/platform";
import { useProject } from "../app/settings/ProjectContext";
import { PhotoRepository } from "../repositories/PhotoRepository";
import { idb } from "../repositories/idb";

export function usePhotoStorage() {
  const { activeProject } = useProject();
  const [ready, setReady] = useState(() => idb.getState().ready);

  useEffect(() => {
    setReady(idb.getState().ready);
    const unsub = idb.subscribe((_, r) => setReady(r));
    idb.open();
    return unsub;
  }, []);

  const savePhoto = useCallback(
    async (rawPhoto, leakId, excludePaths = []) => {
      return PhotoRepository.save(
        rawPhoto,
        {
          projectId: activeProject?.id,
          leakId,
          folderName: activeProject?.folderName,
        },
        excludePaths,
      );
    },
    [activeProject?.id, activeProject?.folderName],
  );

  const deletePhoto = useCallback(
    async (path) => PhotoRepository.delete(path),
    [],
  );

  const getPhoto = useCallback(
    async (id) => PhotoRepository.get(id),
    [],
  );

  const gcOrphanedPhotos = useCallback(
    async (leaks) => {
      await PhotoRepository.gcOrphaned(leaks, {
        projectId: activeProject?.id,
        folderName: activeProject?.folderName,
      });
    },
    [activeProject?.id, activeProject?.folderName],
  );

  return { ready, isNative, savePhoto, deletePhoto, getPhoto, gcOrphanedPhotos };
}
