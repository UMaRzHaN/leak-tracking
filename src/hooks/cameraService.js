import { isNative } from "@/utils/platform";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { markPhotoPrepared } from "@/utils/photoPreparation";
import { dataUrlToBlob } from "@/utils/photoConversion";

export const MAX_PHOTO_INPUT_BYTES = 32 * 1024 * 1024;

function assertPhotoSize(blob) {
  if (blob.size > MAX_PHOTO_INPUT_BYTES) {
    throw new Error("Photo is larger than 32 MB");
  }
  return blob;
}

/*
 * Используем CameraResultType.Uri, чтобы не передавать полноразмерное фото
 * через Capacitor как Base64. Файл остаётся временным и после выбора
 * сохраняется в приватное хранилище приложения (Directory.Data).
 */

async function requestCameraPermission() {
  const perm = await Camera.requestPermissions({ permissions: ["camera"] });
  if (perm.camera !== "granted") {
    throw new Error("Camera permission denied");
  }
}

async function uriPhotoToDraft(photo) {
  if (photo?.dataUrl) {
    const blob = dataUrlToBlob(photo.dataUrl);
    if (!blob?.type?.toLowerCase().startsWith("image/")) {
      throw new Error("Camera returned an invalid photo");
    }
    return {
      raw: markPhotoPrepared(assertPhotoSize(blob)),
      src: photo.dataUrl,
    };
  }

  if (!photo?.webPath) throw new Error("Camera did not return a photo URI");
  const response = await fetch(photo.webPath);
  if (!response.ok) throw new Error("Unable to read the selected photo");
  const blob = assertPhotoSize(await response.blob());
  return {
    raw: markPhotoPrepared(blob),
    src: photo.webPath,
  };
}

/* 📸 Камера (native) */
export async function takePhotoFromCamera() {
  if (!isNative) {
    throw new Error("Camera is available only on mobile");
  }

  await requestCameraPermission();

  const photo = await Camera.getPhoto({
    quality: 80,
    width: 1280,
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
  });

  return uriPhotoToDraft(photo);
}

/* 🖼 Галерея — читаем через Base64, не добавляем новый файл в галерею */
export async function pickPhotoFromGallery() {
  if (!isNative) {
    throw new Error("Gallery is available only on mobile");
  }

  const photo = await Camera.getPhoto({
    quality: 70,
    width: 1280,
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
  });

  return uriPhotoToDraft(photo);
}

/* 🖥 Browser: File input */
export async function readPhotoFromFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Expected File from input");
  }
  if (file.type && !file.type.toLowerCase().startsWith("image/")) {
    throw new Error("Selected file is not an image");
  }
  assertPhotoSize(file);

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
