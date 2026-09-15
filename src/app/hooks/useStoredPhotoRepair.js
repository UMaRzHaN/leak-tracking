import { useEffect, useRef } from "react";
import { useProjectData as useProjectDataCtx } from "@/app/project/ProjectContext";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { idb } from "@/repositories/idb";
import {
  applyPhotoRepairs,
  hasCorruptedPhotoValues,
  saveCorruptedPhotoBlobs,
} from "@/services/storage/photoValueRepair";
import { isNative } from "@/utils/platform";
import { logger } from "@/utils/logger";

/** На вебе снимок не сохранится, пока IndexedDB не открыта. */
function waitForPhotoStore() {
  if (isNative || idb.getState().ready) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = idb.subscribe((_db, ready) => {
      if (!ready) return;
      unsubscribe();
      resolve(undefined);
    });
    idb.open();
  });
}

/**
 * Починка порченых снимков сразу после загрузки проекта.
 *
 * Живёт рядом с данными, а не в хранилище: сохранить Blob в хранилище фото —
 * дело асинхронное и небыстрое, и за это время запись могут поправить. Поэтому
 * замены применяются к свежим данным и записываются обычным сохранением — с
 * версиями полей, ревизией и проверкой на чужую запись, как любая правка.
 *
 * Уборка снимков, пока порча не починена, ничего не удаляет — см.
 * `collectPhotoOwners`: иначе она сочла бы сиротами только что сохранённые
 * снимки. Попытка одна на проект за сеанс: не сохранившийся снимок остаётся в
 * записи, и повтор на каждой перерисовке ничего бы не дал.
 *
 * @param {{
 *   dataRef: {current: any[]},
 *   dataLoaded: boolean,
 *   dataProjectId: string|null,
 *   loadError: any,
 *   save: (next: any[]) => Promise<void>,
 * }} options
 */
export function useStoredPhotoRepair({
  dataRef,
  dataLoaded,
  dataProjectId,
  loadError,
  save,
}) {
  const { activeProject } = useProjectDataCtx();
  const projectId = activeProject?.id ?? null;
  const folderName = activeProject?.folderName ?? null;
  const saveRef = useRef(save);
  const activeProjectIdRef = useRef(projectId);
  const attemptedRef = useRef(new Set());

  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    activeProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    if (!dataLoaded || loadError || !projectId || !folderName) return;
    if (dataProjectId !== projectId || attemptedRef.current.has(projectId)) {
      return;
    }
    if (!hasCorruptedPhotoValues(dataRef.current)) return;
    attemptedRef.current.add(projectId);

    (async () => {
      try {
        await waitForPhotoStore();
        const pathByBlob = await saveCorruptedPhotoBlobs(
          dataRef.current,
          (blob, leakId, options) =>
            PhotoRepository.save(blob, { projectId, leakId, folderName }, [], {
              cleanupOldVersions: false,
              ...options,
            }),
        );
        if (activeProjectIdRef.current !== projectId) return;

        const { leaks, repaired, remaining } = applyPhotoRepairs(
          dataRef.current,
          pathByBlob,
        );
        if (repaired > 0) await saveRef.current(leaks);
        logger.warn(
          "[photoRepair] corrupted photo values repaired / left:",
          repaired,
          remaining,
        );
      } catch (error) {
        logger.error(
          "[photoRepair] corrupted photo values could not be repaired:",
          error,
        );
      }
    })();
  }, [dataLoaded, dataProjectId, dataRef, folderName, loadError, projectId]);
}
