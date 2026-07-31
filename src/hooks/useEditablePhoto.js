import { useEffect, useRef, useState, useCallback } from "react";
import { useCamera } from "./useCamera";
import { usePhotoStorage } from "./usePhotoStorage";
import { usePhotoSrc } from "./usePhotoSrc";
import { dataUrlToBlob } from "@/utils/photoConversion";
import { logger } from "@/utils/logger";

export function useEditablePhoto({
  initialPath,
  leakId,
  version,
  excludePaths = [],
}) {
  const { isNative, takePhoto, pickFromGallery, pickFromBrowser } = useCamera();
  const {
    savePhoto: saveToFS,
    deletePhoto,
    ready: storageReady,
  } = usePhotoStorage();

  // src сохранённого фото (из БД / FS)
  const persistedSrc = usePhotoSrc(initialPath, version);

  const persistedPathRef = useRef(initialPath);
  const activeLeakIdRef = useRef(leakId);
  const mountedRef = useRef(true);

  // черновик фото { raw, src }
  const [draftPhoto, setDraftPhoto] = useState(null);

  /* ===== reset on leak change ===== */
  useEffect(() => {
    activeLeakIdRef.current = leakId;
    persistedPathRef.current = initialPath;
    setDraftPhoto(null);
  }, [initialPath, leakId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ===== change photo ===== */
  const changePhoto = useCallback(
    async (e, source = "camera") => {
      let result;

      if (isNative) {
        result =
          source === "gallery" ? await pickFromGallery() : await takePhoto();
      } else {
        const file = e?.target?.files?.[0];
        if (!file) return;
        result = await pickFromBrowser(file);
      }

      if (!result?.raw || !result?.src) return;

      setDraftPhoto(result);
    },
    [isNative, takePhoto, pickFromGallery, pickFromBrowser],
  );

  const choosePhoto = useCallback(
    async (e) => changePhoto(e, "gallery"),
    [changePhoto],
  );

  /* ===== save ===== */
  const savePhoto = useCallback(async () => {
    // нет черновика → ничего не меняем
    if (!leakId) {
      return persistedPathRef.current;
    }

    const rawPhoto = draftPhoto?.raw ?? dataUrlToBlob(draftPhoto?.src);
    if (!rawPhoto) {
      return persistedPathRef.current;
    }

    // хранилище не готово → честно не сохраняем
    if (!storageReady) {
      logger.warn("Photo storage not ready, save rejected");
      throw new Error("Photo storage is not ready");
    }

    const currentLeakId = leakId;
    const pathsToKeep = [persistedPathRef.current, ...excludePaths].filter(
      Boolean,
    );
    const newPath = await saveToFS(rawPhoto, leakId, pathsToKeep);

    // защита от race-condition
    if (!mountedRef.current || activeLeakIdRef.current !== currentLeakId) {
      if (newPath) {
        try {
          await deletePhoto(newPath);
        } catch {
          // The record was not committed; a later project GC can retry cleanup.
        }
      }
      const error = new Error("Photo save was cancelled");
      error.name = "AbortError";
      throw error;
    }

    if (!newPath) {
      throw new Error("Photo storage did not return a saved path");
    }

    // The caller still has to commit this path to the leak record. Keep the
    // original path and draft until initialPath changes after that commit; if
    // the DB write fails, a retry must create a fresh file instead of reusing
    // the uncommitted path that the caller has already cleaned up.
    return newPath;
  }, [deletePhoto, draftPhoto, excludePaths, leakId, saveToFS, storageReady]);

  /* ===== cancel ===== */
  const resetPhoto = useCallback(() => {
    setDraftPhoto(null);
  }, []);

  return {
    // приоритет: draft → сохранённое
    src: draftPhoto?.src ?? persistedSrc ?? null,
    isDirty: Boolean(draftPhoto?.raw),
    changePhoto,
    choosePhoto,
    savePhoto,
    resetPhoto,
    isNative,
    storageReady, // 👈 можно использовать в UI
  };
}
