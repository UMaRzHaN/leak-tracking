import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
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
export const savePhotoToDocuments = async (
  dataUrl,
  fileName,
  folder = "LeakReports"
) => {
  if (!dataUrl) return null;

  const base64 = dataUrl.split(",")[1];

  try {
    await Filesystem.mkdir({
      path: folder,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch (_) {
    // папка уже есть
  }

  const path = `${folder}/${fileName}`;

  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    encoding: Encoding.BASE64,
  });

  return `Documents/${path}`;
};
export const savePhoto = async (dataUrl, fileName) => {
  if (!dataUrl) return null;

  /* ===== MOBILE ===== */
  if (Capacitor.isNativePlatform()) {
    const base64 = dataUrl.split(",")[1];
    const folder = "LeakReports";

    try {
      await Filesystem.mkdir({
        path: folder,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (_) {}

    const path = `${folder}/${fileName}`;

    // 🔁 ПЕРЕЗАПИСЬ — writeFile перезапишет файл автоматически
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
    });

    return `Documents/${path}`;
  }

  /* ===== WEB ===== */
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName; // одинаковое имя → логическая перезапись
  document.body.appendChild(link);
  link.click();
  link.remove();

  return `Downloads/${fileName}`;
};
