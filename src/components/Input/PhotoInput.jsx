import { useRef, useId, useCallback, useEffect } from "react";
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

  // 🔒 корректная защита от async после unmount
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

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

      // 🔄 сброс input, чтобы можно было выбрать тот же файл повторно
      e.target.value = "";
    },
    [pickFromBrowser, onChange],
  );

  const showError = required && !value;

  return (
    <div
      className={[s.photoInput, showError && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      {/* LABEL */}
      <div className={s.fieldLabel}>
        {label}
        {required && <span className={s.required}> *</span>}
      </div>

      {/* ACTION BUTTON */}
      <button
        type="button"
        className={s.photoBtn}
        tabIndex={-1} // ⛔ не участвует в Enter-навигации
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
        <div className={s.fieldError}>
          Поле «{label}» обязательно
        </div>
      )}
    </div>
  );
}
