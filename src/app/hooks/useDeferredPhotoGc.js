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
  suspended = false,
  isSuspended,
  resumeKey = 0,
}) {
  const gcRanRef = useRef(false);

  useEffect(() => {
    gcRanRef.current = false;
  }, [activeProjectId]);

  useEffect(() => {
    const photoGcIsSuspended =
      suspended || (typeof isSuspended === "function" && isSuspended());

    if (
      photoGcIsSuspended ||
      !activeProjectId ||
      !dataLoaded ||
      dataProjectId !== activeProjectId ||
      loadError ||
      gcRanRef.current
    ) {
      return undefined;
    }

    return scheduleIdleWork(() => {
      if (
        gcRanRef.current ||
        suspended ||
        (typeof isSuspended === "function" && isSuspended())
      ) {
        return;
      }

      gcRanRef.current = true;
      gcOrphanedPhotos(dataForPhotoGc).catch((error) => {
        gcRanRef.current = false;
        logger.warn("Photo GC error:", error);
      });
    });
  }, [
    activeProjectId,
    dataForPhotoGc,
    dataLoaded,
    dataProjectId,
    gcOrphanedPhotos,
    isSuspended,
    loadError,
    resumeKey,
    suspended,
  ]);
}
