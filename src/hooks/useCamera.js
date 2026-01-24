import { Capacitor } from "@capacitor/core";
import {
  takePhotoFromCamera,
  pickPhotoFromGallery,
  readPhotoFromFile,
} from "../services/cameraService";

export const useCamera = () => {
  const isNative = Capacitor.isNativePlatform();

  const normalizePhoto = (photo) => {
    if (photo.webPath) return photo.webPath;

    if (photo.base64String && photo.format) {
      return `data:image/${photo.format};base64,${photo.base64String}`;
    }

    if (photo.path) return photo.path;

    return null;
  };

  const wrap = async (fn) => {
    const raw = await fn();
    return {
      raw,
      preview: normalizePhoto(raw),
    };
  };

  return {
    isNative,

    takePhoto: () => wrap(takePhotoFromCamera),

    pickFromGallery: () => wrap(pickPhotoFromGallery),

    pickFromBrowser: (file) =>
      wrap(() => readPhotoFromFile(file)),
  };
};
