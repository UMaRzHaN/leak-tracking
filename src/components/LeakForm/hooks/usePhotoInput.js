import { useCamera } from "../../hooks/useCamera";

export function usePhotoInput(setForm) {
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const onPhoto = async (file) => {
    const photo = isNative
      ? await takePhoto()
      : await pickFromBrowser(file);

    setForm((p) => ({
      ...p,
      _newPhoto: photo,
      photoPreview: photo.webPath,
    }));
  };

  return { isNative, onPhoto };
}
