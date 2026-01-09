import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export const useCamera = () => {
  const takePhoto = async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("useCamera: not native platform");
    }

    const perm = await Camera.requestPermissions();
    if (perm.camera !== "granted") {
      throw new Error("Нет доступа к камере");
    }

    const photo = await Camera.getPhoto({
      quality: 70,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });

    return photo.dataUrl; // base64
  };

  const pickFromGallery = async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("useCamera: not native platform");
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

  const pickFromBrowser = (file) =>
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

  return {
    takePhoto,
    pickFromGallery,
    pickFromBrowser,
    isNative: Capacitor.isNativePlatform(),
  };
};
