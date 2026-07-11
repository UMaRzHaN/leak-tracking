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
  const { isNative, takePhoto, pickFromBrowser } = useCamera();
  const { savePhoto: saveToFS, ready: storageReady } = usePhotoStorage();

  // src сохранённого фото (из БД / FS)
  const persistedSrc = usePhotoSrc(initialPath, version);

  const persistedPathRef = useRef(initialPath);
  const activeLeakIdRef = useRef(leakId);

  // черновик фото { raw, src }
  const [draftPhoto, setDraftPhoto] = useState(null);

  /* ===== reset on leak change ===== */
  useEffect(() => {
    activeLeakIdRef.current = leakId;
    persistedPathRef.current = initialPath;
    setDraftPhoto(null);
  }, [initialPath, leakId]);

  /* ===== change photo ===== */
  const changePhoto = useCallback(
    async (e) => {
      let result;

      if (isNative) {
        result = await takePhoto();
      } else {
        const file = e?.target?.files?.[0];
        if (!file) return;
        result = await pickFromBrowser(file);
      }

      if (!result?.raw || !result?.src) return;

      setDraftPhoto(result);
    },
    [isNative, takePhoto, pickFromBrowser],
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
      logger.warn("Photo storage not ready, save skipped");
      return persistedPathRef.current;
    }

    const currentLeakId = leakId;
    const newPath = await saveToFS(rawPhoto, leakId, excludePaths);

    // защита от race-condition
    if (activeLeakIdRef.current !== currentLeakId) {
      return persistedPathRef.current;
    }

    if (!newPath) {
      return persistedPathRef.current;
    }

    persistedPathRef.current = newPath;
    setDraftPhoto(null);

    return newPath;
  }, [draftPhoto, leakId, saveToFS, storageReady, excludePaths]);

  /* ===== cancel ===== */
  const resetPhoto = useCallback(() => {
    setDraftPhoto(null);
  }, []);

  return {
    // приоритет: draft → сохранённое
    src: draftPhoto?.src ?? persistedSrc ?? null,
    isDirty: Boolean(draftPhoto?.raw),
    changePhoto,
    savePhoto,
    resetPhoto,
    isNative,
    storageReady, // 👈 можно использовать в UI
  };
}
