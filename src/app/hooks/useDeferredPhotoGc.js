import { useEffect, useRef } from "react";
import { logger } from "@/utils/logger";
import { scheduleIdleWork } from "@/utils/scheduleIdleWork";

export function useDeferredPhotoGc({
  activeProjectId,
  dataForPhotoGc,
  dataLoaded,
  dataProjectId,
  loadError,
  gcOrphanedPhotos,
}) {
  const gcRanRef = useRef(false);

  useEffect(() => {
    gcRanRef.current = false;
  }, [activeProjectId]);

  useEffect(() => {
    if (
      !activeProjectId ||
      !dataLoaded ||
      dataProjectId !== activeProjectId ||
      loadError ||
      gcRanRef.current
    )
      return undefined;

    return scheduleIdleWork(() => {
      if (gcRanRef.current) return;
      gcRanRef.current = true;
      gcOrphanedPhotos(dataForPhotoGc).catch((error) =>
        logger.warn("Photo GC error:", error),
      );
    });
  }, [
    activeProjectId,
    dataForPhotoGc,
    dataLoaded,
    dataProjectId,
    gcOrphanedPhotos,
    loadError,
  ]);
}
