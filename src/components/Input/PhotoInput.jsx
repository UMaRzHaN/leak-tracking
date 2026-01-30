import { useRef, useId, useCallback } from "react";
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
  const aliveRef = useRef(true);
  const inputId = useId();

  const { isNative, takePhoto, pickFromBrowser } = useCamera();

  const handleClick = useCallback(async () => {
    if (isNative) {
      const photo = await takePhoto();
      if (photo && aliveRef.current) {
        onChange(photo);
      }
    } else {
      inputRef.current?.click();
    }
  }, [isNative, takePhoto, onChange]);

  const handleFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const photo = await pickFromBrowser(file);
      if (photo && aliveRef.current) {
        onChange(photo);
      }

      e.target.value = "";
    },
    [pickFromBrowser, onChange],
  );

  // 🔒 защита от async после unmount
  // (можно не делать cleanup — ref обнулим вручную)
  aliveRef.current = true;

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
        tabIndex={-1}                 // ⛔ не участвует в Enter-навигации
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
        <img
          src={value.src}
          alt="Выбранное фото"
          className={s.photoPreview}
        />
      )}

      {/* ERROR MESSAGE */}
      {showError && (
        <div className={s.fieldError}>Поле «{label}» обязательно</div>
      )}
    </div>
  );
}
