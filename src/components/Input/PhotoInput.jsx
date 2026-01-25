import { useRef } from "react";
import { useCamera } from "../../hooks/useCamera";
import s from "./Input.module.scss";

export default function PhotoInput({
  value,
  onChange,
  label = "Фото",
  required = false,
  error,
}) {
  const inputRef = useRef(null);
  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const inputId = "photo-input";

  const handleClick = async () => {
    if (isNative) {
      const photo = await takePhoto();
      if (photo) onChange(photo);
    } else {
      inputRef.current?.click();
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const photo = await pickFromBrowser(file);
    if (photo) onChange(photo);

    e.target.value = "";
  };

  const showError = required && !value;

  return (
    <div
      className={[s.photoInput, showError && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      {/* LABEL */}
      <label className={s.fieldLabel} htmlFor={inputId}>
        {label}
        {required && <span className={s.required}> *</span>}
      </label>

      {/* ACTION BUTTON */}
      <button
        type="button"
        className={s.photoBtn}
        onClick={handleClick}
        aria-describedby={inputId}
      >
        {isNative ? "📷 Сделать / выбрать фото" : "📁 Выбрать файл"}
      </button>

      {/* HIDDEN FILE INPUT (WEB) */}
      {!isNative && (
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFile}
        />
      )}

      {/* PREVIEW */}
      {value?.src && (
        <img src={value.src} alt="Выбранное фото" className={s.photoPreview} />
      )}

      {/* ERROR MESSAGE */}
      {showError && (
        <div className={s.fieldError}>Поле «{label}» обязательно</div>
      )}
    </div>
  );
}
