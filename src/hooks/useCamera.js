import { Capacitor } from "@capacitor/core";
import {
  takePhotoFromCamera,
  pickPhotoFromGallery,
  readPhotoFromFile,
} from "../services/cameraService";

export const useCamera = () => {
  return {
    isNative: Capacitor.isNativePlatform(),

    takePhoto: async () => {
      return await takePhotoFromCamera();
    },

    pickFromGallery: async () => {
      return await pickPhotoFromGallery();
    },

    pickFromBrowser: async (file) => {
      return await readPhotoFromFile(file);
    },
  };
};
