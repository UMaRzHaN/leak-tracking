import { useRef } from "react";
import { useCamera } from "../../hooks/useCamera";
import s from "./Input.module.scss";

export default function PhotoInput({ value, onChange, label = "Фото" }) {
  const inputRef = useRef(null);
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const inputId = "photo-input"; // 👈 стабильный id

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
      {/* ✅ label связан с input */}
      <label className={s.fieldLabel} htmlFor={inputId}>
        {label}
      </label>

      <button
        type="button"
        className={s.photoBtn}
        onClick={handleClick}
        aria-describedby={inputId} // ♿ доп. связь для screen reader
      >
        {isNative ? "📷 Сделать / выбрать фото" : "📁 Выбрать файл"}
      </button>

      {!isNative && (
        <input
          id={inputId}              // 👈 ключевой момент
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFile}
        />
      )}

      {value?.src && (
        <img
          src={value.src}
          alt="Выбранное фото"
          className={s.photoPreview}
        />
      )}
    </div>
  );
}
