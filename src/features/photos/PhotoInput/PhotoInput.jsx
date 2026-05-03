import { useRef, useId, useCallback, useEffect } from "react";
import { useCamera } from "@/hooks/useCamera";
import s from "./PhotoInput.module.scss";

export default function PhotoInput({
  value,
  onChange,
  label = "Фото",
  required = false,
  error = false,
}) {
  const inputRef = useRef(null);
  const aliveRef = useRef(true);
  const inputId = useId();

  const { isNative, takePhoto, pickFromGallery, pickFromBrowser } = useCamera();

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handleCamera = useCallback(async () => {
    const photo = await takePhoto();
    if (photo && aliveRef.current) onChange(photo);
  }, [takePhoto, onChange]);

  const handleGallery = useCallback(async () => {
    if (isNative) {
      const photo = await pickFromGallery();
      if (photo && aliveRef.current) onChange(photo);
    } else {
      inputRef.current?.click();
    }
  }, [isNative, pickFromGallery, onChange]);

  const handleFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const photo = await pickFromBrowser(file);
      if (photo && aliveRef.current) onChange(photo);
      e.target.value = "";
    },
    [pickFromBrowser, onChange],
  );

  const hasPhoto = Boolean(value?.src);

  const actionButtons = isNative ? (
    <>
      <button type="button" className={s.btn} onClick={handleCamera}>
        <span className={s.btnIcon}>📷</span>
        Камера
      </button>
      <button type="button" className={s.btn} onClick={handleGallery}>
        <span className={s.btnIcon}>🖼️</span>
        Галерея
      </button>
    </>
  ) : (
    <button
      type="button"
      className={`${s.btn} ${s.btnFull}`}
      onClick={handleGallery}
    >
      <span className={s.btnIcon}>📁</span>
      {hasPhoto ? "Заменить фото" : "Выбрать файл"}
    </button>
  );

  return (
    <div
      className={[s.photoInput, error && s.hasError].filter(Boolean).join(" ")}
    >
      <div className={s.fieldLabel}>
        {label}
        {required && <span className={s.required}> *</span>}
      </div>

      <div className={s.card}>
        {hasPhoto ? (
          <img
            src={value.src}
            alt="Выбранное фото"
            className={s.photoPreview}
          />
        ) : (
          <>
            <div className={s.cardIcon}>📷</div>
            <div className={s.cardTitle}>Добавить фото результата</div>
            <div className={s.cardHint}>Рекомендуется для отчётности</div>
          </>
        )}

        <div className={s.actions}>{actionButtons}</div>
      </div>

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

      {error && <div className={s.fieldError}>Поле «{label}» обязательно</div>}
    </div>
  );
}
