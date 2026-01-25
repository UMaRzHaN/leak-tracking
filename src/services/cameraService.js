import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

/* 📸 Камера / Галерея (MOBILE ONLY) */
export async function takePhotoFromCamera() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Camera is available only on mobile");
  }

  const perm = await Camera.requestPermissions({ permissions: ["camera"] });
  if (perm.camera !== "granted") {
    throw new Error("Camera permission denied");
  }

  const photo = await Camera.getPhoto({
    quality: 80,
    source: CameraSource.Prompt,
    resultType: CameraResultType.Uri,
  });

  return {
    raw: photo,        // CameraPhoto
    src: photo.webPath // preview
  };
}

/* 🖼 Галерея (mobile picker) */
export async function pickPhotoFromGallery() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Gallery is available only on mobile");
  }

  const photo = await Camera.getPhoto({
    quality: 70,
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
  });

  return {
    raw: photo,
    src: photo.webPath
  };
}

/* 🖥 Browser: File input */
export async function readPhotoFromFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Expected File from input");
  }

  return {
    raw: file,                         // 🔑 File
    src: URL.createObjectURL(file),    // preview
  };
}
