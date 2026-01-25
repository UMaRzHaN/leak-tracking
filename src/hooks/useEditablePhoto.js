import { useEffect, useRef, useState, useCallback } from "react";
import { useCamera } from "./useCamera";
import { usePhotoStorage } from "./usePhotoStorage";
import { usePhotoSrc } from "./usePhotoSrc";

export function useEditablePhoto({ initialPath, leakId, version }) {
  const { isNative, takePhoto, pickFromBrowser } = useCamera();
  const { savePhoto: saveToFS } = usePhotoStorage();

  // src сохранённого фото (из БД)
  const persistedSrc = usePhotoSrc(initialPath, version);

  const persistedPathRef = useRef(initialPath);
  const activeLeakIdRef = useRef(leakId);

  // черновик фото
  // { raw, src }
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
        result = await takePhoto(); // { raw, src }
      } else {
        const file = e?.target?.files?.[0];
        if (!file) return;
        result = await pickFromBrowser(file); // { raw, src }
      }

      if (!result?.raw || !result?.src) return;

      setDraftPhoto(result);
    },
    [isNative, takePhoto, pickFromBrowser],
  );

  /* ===== save ===== */
  const savePhoto = useCallback(async () => {
    if (!draftPhoto?.raw || !leakId) {
      return persistedPathRef.current;
    }

    const currentLeakId = leakId;
    const newPath = await saveToFS(draftPhoto.raw, leakId);

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
  }, [draftPhoto, leakId, saveToFS]);

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
  };
}
