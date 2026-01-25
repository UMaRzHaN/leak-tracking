import { useRef } from "react";
import { useCamera } from "../../hooks/useCamera";
import s from "./Input.module.scss";

export default function PhotoInput({ value, onChange, label = "Фото" }) {
  const inputRef = useRef(null);
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const handleClick = async () => {
    if (isNative) {
      const photo = await takePhoto(); // { raw, src }
      if (photo) onChange(photo);
    } else {
      inputRef.current?.click();
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const photo = await pickFromBrowser(file); // { raw, src }
    if (photo) onChange(photo);

    e.target.value = "";
  };

  return (
    <div className={s.photoInput}>
      <label>{label}</label>

      <button type="button" onClick={handleClick}>
        {isNative ? "📷 Сделать / выбрать фото" : "📁 Выбрать файл"}
      </button>

      {value?.src && (
        <img
          src={value.src}
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
          hidden
          onChange={handleFile}
        />
      )}
    </div>
  );
}

