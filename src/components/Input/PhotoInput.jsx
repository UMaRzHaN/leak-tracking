import { useRef } from "react";
import { useCamera } from "../../hooks/useCamera";
import s from "./Input.module.scss";

export default function PhotoInput({
  value, // photoPreview (string | null)
  onChange, // (photoObject) => void
  label = "Фото",
}) {
  const inputRef = useRef(null);
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const handleClick = async (e) => {
    if (isNative) {
      const photo = await takePhoto();
      if (!photo) return;
      onChange(photo);
    } else {
      inputRef.current?.click();
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const photo = await pickFromBrowser(file);
    if (!photo) return;

    onChange(photo);
    e.target.value = ""; // сброс input
  };

  return (
    <div className={s.photoInput}>
      <label className={s.photoLabel}>{label}</label>

      <button type="button" className={s.photoBtn} onClick={handleClick}>
        📷 Сделать / выбрать фото
      </button>

      {value && (
        <img
          src={value}
          alt="Фото"
          className={s.photoPreview}
          style={{ maxWidth: 120, marginTop: 10 }}
        />
      )}
      {!isNative && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleFile}
        />
      )}
    </div>
  );
}
