import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Filesystem, Directory } from "@capacitor/filesystem";

const PHOTO_FOLDER = "LeakReports/photos";

/* 📸 Камера */
export const takePhotoFromCamera = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Камера доступна только на мобильных устройствах");
  }

  const perm = await Camera.requestPermissions({ permissions: ["camera"] });
  if (perm.camera !== "granted") {
    throw new Error("Нет доступа к камере");
  }
  const photo = await Camera.getPhoto({
    quality: 80,
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
  });

  return {
    ...photo,
    isNative: true, // ✅ КРИТИЧНО
  };
};

/* 🖼 Галерея */
export const pickPhotoFromGallery = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Галерея доступна только на мобильных устройствах");
  }

  // ❌ НЕ проверяем perm.photos
  return await Camera.getPhoto({
    quality: 70,
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
  });
};

/* 💾 Сохранение */
export const savePhoto = async (photo, fileName) => {
  if (!photo?.path || !fileName) return null;

  try {
    await Filesystem.mkdir({
      path: PHOTO_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });

    const targetPath = `${PHOTO_FOLDER}/${fileName}`;

    await Filesystem.copy({
      from: photo.path,
      to: targetPath,
      directory: Directory.Documents,
    });

    return `Documents/${targetPath}`;
  } catch (e) {
    console.error("savePhoto error:", e);
    return null;
  }
};
/**
 * 🖥 Browser: File → object
 */
export const readPhotoFromFile = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return reject("Файл не выбран");

    const reader = new FileReader();

    reader.onloadend = () =>
      resolve({
        webPath: reader.result, // ✅ preview
        isNative: false,        // ✅ КЛЮЧЕВОЙ ФЛАГ
      });

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

