import { isNative } from "@/utils/platform";
import { appError, errorCode } from "@/utils/appError";
import { markPhotoPrepared } from "@/utils/photoPreparation";
import { dataUrlToBlob } from "@/utils/photoConversion";

export const MAX_PHOTO_INPUT_BYTES = 32 * 1024 * 1024;

function assertPhotoSize(blob) {
  if (blob.size > MAX_PHOTO_INPUT_BYTES) {
    throw appError("PHOTO_TOO_LARGE", "Photo is larger than 32 MB");
  }
  return blob;
}

/*
 * Используем CameraResultType.Uri, чтобы не передавать полноразмерное фото
 * через Capacitor как Base64. Файл остаётся временным и после выбора
 * сохраняется в приватное хранилище приложения (Directory.Data).
 */

/**
 * Плагин камеры грузится по действию, а не при старте приложения: чанк
 * Capacitor общий на все плагины, и статический импорт затаскивал камеру,
 * сканер штрихкодов и распознавание речи на первый экран.
 */
function loadCamera() {
  return import("@capacitor/camera");
}

/*
 * Коды отмены из CameraErrorCode плагина: съёмка, правка и выбор из галереи.
 * Старый путь getPhoto отменяется без кода, текстом «User cancelled photos
 * app» — его узнаём по слову.
 */
const CANCEL_CODES = new Set([
  "OS-PLUG-CAMR-0006",
  "OS-PLUG-CAMR-0013",
  "OS-PLUG-CAMR-0020",
]);

/**
 * Человек закрыл камеру или галерею, ничего не выбрав. Это не ошибка:
 * сообщать о ней нечего.
 * @param {unknown} error
 */
export function isCameraCancel(error) {
  const code = errorCode(error);
  if (code && CANCEL_CODES.has(code)) return true;
  const message = /** @type {any} */ (error)?.message ?? error;
  return typeof message === "string" && /cancel/i.test(message);
}

/**
 * Снимок через плагин: отмена — null, а не исключение; прочий отказ плагина
 * приходит с его собственным английским текстом и уходит наружу кодом,
 * чтобы на экран попал перевод, а не сырой текст плагина.
 * @param {(message: string) => Error} toFailure ошибка с кодом этого действия
 * @param {Record<string, unknown>} options
 */
async function getPhoto(toFailure, options) {
  const { Camera } = await loadCamera();
  try {
    return await Camera.getPhoto(options);
  } catch (error) {
    if (isCameraCancel(error)) return null;
    const failure = /** @type {Error & { cause?: unknown }} */ (
      toFailure(/** @type {any} */ (error)?.message || "Camera failed")
    );
    failure.cause = error;
    throw failure;
  }
}

async function requestCameraPermission() {
  const { Camera } = await loadCamera();
  const perm = await Camera.requestPermissions({ permissions: ["camera"] });
  if (perm.camera !== "granted") {
    throw appError("CAMERA_PERMISSION_REQUIRED", "Camera permission denied");
  }
}

async function uriPhotoToDraft(photo) {
  if (photo?.dataUrl) {
    const blob = dataUrlToBlob(photo.dataUrl);
    if (!blob?.type?.toLowerCase().startsWith("image/")) {
      throw appError("PHOTO_INVALID", "Camera returned an invalid photo");
    }
    return {
      raw: markPhotoPrepared(assertPhotoSize(blob)),
      src: photo.dataUrl,
    };
  }

  if (!photo?.webPath)
    throw appError("PHOTO_NOT_RETURNED", "Camera did not return a photo URI");
  const response = await fetch(photo.webPath);
  if (!response.ok)
    throw appError("PHOTO_READ_FAILED", "Unable to read the selected photo");
  const blob = assertPhotoSize(await response.blob());
  return {
    raw: markPhotoPrepared(blob),
    src: photo.webPath,
  };
}

/* 📸 Камера (native) */
export async function takePhotoFromCamera() {
  if (!isNative) {
    throw appError("CAMERA_MOBILE_ONLY", "Camera is available only on mobile");
  }

  await requestCameraPermission();

  const { CameraResultType, CameraSource } = await loadCamera();
  const photo = await getPhoto(
    (message) => appError("CAMERA_FAILED", message),
    {
      quality: 80,
      width: 1280,
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
    },
  );

  return photo ? uriPhotoToDraft(photo) : null;
}

/* 🖼 Галерея — читаем через Base64, не добавляем новый файл в галерею */
export async function pickPhotoFromGallery() {
  if (!isNative) {
    throw appError(
      "GALLERY_MOBILE_ONLY",
      "Gallery is available only on mobile",
    );
  }

  const { CameraResultType, CameraSource } = await loadCamera();
  const photo = await getPhoto(
    (message) => appError("GALLERY_FAILED", message),
    {
      quality: 70,
      width: 1280,
      source: CameraSource.Photos,
      resultType: CameraResultType.Uri,
    },
  );

  return photo ? uriPhotoToDraft(photo) : null;
}

/* 🖥 Browser: File input */
export async function readPhotoFromFile(file) {
  if (!(file instanceof File)) {
    throw appError("PHOTO_READ_FAILED", "Expected File from input");
  }
  if (file.type && !file.type.toLowerCase().startsWith("image/")) {
    throw appError("PHOTO_NOT_IMAGE", "Selected file is not an image");
  }
  assertPhotoSize(file);

  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(
          appError("PHOTO_READ_FAILED", "FileReader result is not string"),
        );
        return;
      }
      resolve(result);
    };
    reader.onerror = () =>
      reject(
        appError("PHOTO_READ_FAILED", "Unable to read the selected photo"),
      );
    reader.readAsDataURL(file);
  });

  return {
    raw: file,
    src,
  };
}
