import { useState, useCallback } from "react";
import {
  deletePhotoFromFS,
  getPhotoSrc,
  photoExists,
} from "../services/photoService";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

export function usePhotoStorage() {
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);

  /* ===== сохранить фото ===== */

  async function savePhotoByBase64(dataUrl, id) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const folder = "LeakReports/photos";
    const fileName = `photo_${id}.jpg`;
    const targetPath = `${folder}/${fileName}`;

    // ✅ безопасное создание папки
    await Filesystem.mkdir({
      path: folder,
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    await Filesystem.writeFile({
      path: targetPath,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    return `Documents/${targetPath}`;
  }
  async function savePhoto(photo, id) {
    if (!photo?.webPath || !id) return null;

    // 🌐 base64 (web)
    if (photo.webPath.startsWith("data:image")) {
      return await savePhotoByBase64(photo.webPath, id);
    }

    // 📱 native (Android / iOS)
    const response = await fetch(photo.webPath);
    const blob = await response.blob();

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return await savePhotoByBase64(`data:image/jpeg;base64,${base64}`, id);
  }

  /* ===== загрузить фото для редактирования ===== */
  const loadPhoto = useCallback(async (path) => {
    if (!path) {
      setPhotoPreview(null);
      setPhotoPath(null);
      return;
    }

    const exists = await photoExists(path);
    if (!exists) {
      setPhotoPreview(null);
      setPhotoPath(null);
      return;
    }
    const src = await getPhotoSrc(path); // 🔥 ВАЖНО
    console.log({
      path,
      exists,
      src,
    });
    setPhotoPath(path);
    setPhotoPreview(src ?? null);
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
