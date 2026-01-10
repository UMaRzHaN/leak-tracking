import { useState, useCallback } from "react";
import {
  savePhotoToFS,
  deletePhotoFromFS,
  getPhotoSrc,
  photoExists,
} from "../services/photoService";

export function usePhotoStorage() {
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);

  /* ===== сохранить фото ===== */
  const savePhoto = useCallback(async (base64, id) => {
    const path = await savePhotoToFS(base64, id);
    setPhotoPath(path);
    return path;
  }, []);

  /* ===== загрузить фото для редактирования ===== */
  const loadPhoto = useCallback(async (path) => {
    if (!path) return;

    const exists = await photoExists(path);
    if (!exists) {
      setPhotoPreview(null);
      setPhotoPath(null);
      return;
    }

    setPhotoPath(path);
    setPhotoPreview(getPhotoSrc(path));
  }, []);

  /* ===== удалить фото ===== */
  const deletePhoto = useCallback(async () => {
    if (photoPath) {
      await deletePhotoFromFS(photoPath);
    }
    setPhotoPreview(null);
    setPhotoPath(null);
  }, [photoPath]);

  const clearPreview = () => {
    setPhotoPreview(null);
  };

  return {
    photoPreview, // src для <img>
    photoPath, // путь для БД
    setPhotoPreview, // при выборе файла
    savePhoto, // сохранить в FS
    loadPhoto, // восстановить preview
    deletePhoto, // удалить файл
    clearPreview,
  };
}
