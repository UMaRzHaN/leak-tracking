import { useEffect, useState, useCallback } from "react";
import { isNative } from "@/utils/platform";
import { useProjectData } from "@/app/project/ProjectContext";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { idb } from "@/repositories/idb";

export function usePhotoStorage() {
  const { activeProject } = useProjectData();
  const [ready, setReady] = useState(() =>
    isNative ? !activeProject?.folderName : idb.getState().ready,
  );
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    if (isNative) {
      return undefined;
    }

    setReady(idb.getState().ready);
    const unsub = idb.subscribe((_, r) => setReady(r));
    idb.open();
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!isNative) return undefined;
    if (!activeProject?.folderName) {
      setStorageError(null);
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    setStorageError(null);
    PhotoRepository.prepare({ folderName: activeProject.folderName })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageError(error);
          setReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
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
    async (path) =>
      PhotoRepository.delete(path, {
        projectId: activeProject?.id,
        folderName: activeProject?.folderName,
      }),
    [activeProject?.folderName, activeProject?.id],
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
    status: storageError ? "error" : ready ? "ready" : "initializing",
    storageError,
    isNative,
    savePhoto,
    deletePhoto,
    getPhoto,
    gcOrphanedPhotos,
  };
}
