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

  // 📱 Native (camera OR gallery)
  if (photo.path) {
    return {
      webPath:
        photo.webPath ||
        Capacitor.convertFileSrc(photo.path), // 🔑 ВОТ ОН
      path: photo.path,
      isNative: true,
    };
  }

  // 🌐 Web (FileReader / base64)
  return {
    webPath: photo,
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
