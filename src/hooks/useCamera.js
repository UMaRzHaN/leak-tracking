import { isNative } from "../utils/platform";
import {
  takePhotoFromCamera,
  pickPhotoFromGallery,
  readPhotoFromFile,
} from "../services/cameraService";

export const useCamera = () => {

  return {
    isNative,

    // 📱 Камера / Галерея (native)
    takePhoto: async () => {
      const result = await takePhotoFromCamera(); // { raw, src }
      return result;
    },

    pickFromGallery: async () => {
      const result = await pickPhotoFromGallery(); // { raw, src }
      return result;
    },

    // 🌐 Browser
    pickFromBrowser: async (file) => {
      const result = await readPhotoFromFile(file); // { raw, src }
      return result;
    },
  };
};
