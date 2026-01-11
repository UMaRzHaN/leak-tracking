import { Capacitor } from "@capacitor/core";
import {
  takePhotoFromCamera,
  pickPhotoFromGallery,
  readPhotoFromFile,
} from "../services/cameraService";

export const useCamera = () => {
  const isNative = Capacitor.isNativePlatform();

  const normalizePhoto = (photo) => {
    if (!photo) return null;

    // 📱 Native (Camera.getPhoto)
    if (photo.webPath) {
      return {
        webPath: photo.webPath,
        path: photo.path, // может быть undefined — это нормально
        isNative: true,
      };
    }

    // 🌐 Web (base64)
    return {
      webPath: photo, // dataUrl
      isNative: false,
    };
  };

  return {
    isNative,

    takePhoto: async () => normalizePhoto(await takePhotoFromCamera()),

    pickFromGallery: async () => normalizePhoto(await pickPhotoFromGallery()),

    pickFromBrowser: async (file) =>
      normalizePhoto(await readPhotoFromFile(file)),
  };
};
