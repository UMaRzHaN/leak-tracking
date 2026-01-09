import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

/**
 * 📱 Сделать фото с камеры (MOBILE)
 * @returns base64 (dataUrl)
 */
export const takePhotoFromCamera = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Камера доступна только на мобильных устройствах");
  }

  const perm = await Camera.requestPermissions();
  if (perm.camera !== "granted") {
    throw new Error("Нет доступа к камере");
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  });

  return photo.dataUrl;
};

/**
 * 📁 Выбрать фото из галереи (MOBILE)
 */
export const pickPhotoFromGallery = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Галерея доступна только на мобильных устройствах");
  }

  const perm = await Camera.requestPermissions();
  if (perm.photos !== "granted" && perm.camera !== "granted") {
    throw new Error("Нет доступа к галерее");
  }

  const photo = await Camera.getPhoto({
    quality: 70,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
  });

  return photo.dataUrl;
};

/**
 * 🖥 Browser: File → base64
 */
export const readPhotoFromFile = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return reject("Файл не выбран");

    if (!file.type.startsWith("image/")) {
      return reject("Выберите изображение");
    }

    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
