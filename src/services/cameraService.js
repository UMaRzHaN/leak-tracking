import { isNative } from "../utils/platform";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

/*
 * Используем CameraResultType.Base64, чтобы фотографии НЕ сохранялись
 * в публичную галерею устройства. Данные приходят напрямую в память
 * и сохраняются в приватное хранилище приложения (Directory.Data).
 */

async function requestCameraPermission() {
  const perm = await Camera.requestPermissions({ permissions: ["camera"] });
  if (perm.camera !== "granted") {
    throw new Error("Camera permission denied");
  }
}

function base64ToBlob(base64, mimeType = "image/jpeg") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/* 📸 Камера (native) */
export async function takePhotoFromCamera() {
  if (!isNative) {
    throw new Error("Camera is available only on mobile");
  }

  await requestCameraPermission();

  const photo = await Camera.getPhoto({
    quality: 80,
    source: CameraSource.Camera,
    resultType: CameraResultType.Base64,
  });

  const blob = base64ToBlob(photo.base64String, `image/${photo.format}`);

  return {
    raw: blob,
    src: `data:image/${photo.format};base64,${photo.base64String}`,
  };
}

/* 🖼 Галерея — читаем через Base64, не добавляем новый файл в галерею */
export async function pickPhotoFromGallery() {
  if (!isNative) {
    throw new Error("Gallery is available only on mobile");
  }

  const photo = await Camera.getPhoto({
    quality: 70,
    source: CameraSource.Photos,
    resultType: CameraResultType.Base64,
  });

  const blob = base64ToBlob(photo.base64String, `image/${photo.format}`);

  return {
    raw: blob,
    src: `data:image/${photo.format};base64,${photo.base64String}`,
  };
}

/* 🖥 Browser: File input */
export async function readPhotoFromFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Expected File from input");
  }

  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader result is not string"));
        return;
      }
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return {
    raw: file,
    src,
  };
}
