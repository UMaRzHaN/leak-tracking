import { useRef, useId, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCamera } from "@/hooks/useCamera";
import s from "./PhotoInput.module.scss";

export default function PhotoInput({
  value,
  onChange,
  label = /** @type {string|null} */ (null),
  required = false,
  error = false,
  compact = false,
}) {
  const { t } = useTranslation();
  const fieldLabel = label ?? t("photoInput.photo");
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const aliveRef = useRef(true);
  const inputId = useId();
  const [cameraError, setCameraError] = useState("");

  const { isNative, takePhoto, pickFromGallery, pickFromBrowser } = useCamera();

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handleCamera = useCallback(async () => {
    try {
      setCameraError("");
      const photo = await takePhoto();
      if (photo && aliveRef.current) onChange(photo);
    } catch (/** @type {any} */ error) {
      setCameraError(error?.message || "Unable to open camera");
    }
  }, [takePhoto, onChange]);

  const handleGallery = useCallback(async () => {
    setCameraError("");
    if (isNative) {
      try {
        const photo = await pickFromGallery();
        if (photo && aliveRef.current) onChange(photo);
      } catch (/** @type {any} */ error) {
        setCameraError(error?.message || "Unable to open gallery");
      }
    } else {
      inputRef.current?.click();
    }
  }, [isNative, pickFromGallery, onChange]);

  const handleFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        setCameraError("");
        const photo = await pickFromBrowser(file);
        if (photo && aliveRef.current) onChange(photo);
      } catch (/** @type {any} */ error) {
        setCameraError(error?.message || "Unable to read photo");
      } finally {
        e.target.value = "";
      }
    },
    [pickFromBrowser, onChange],
  );

  const hasPhoto = Boolean(value?.src);

  const actionButtons = isNative ? (
    <>
      <button type="button" className={s.btn} onClick={handleCamera}>
        <span className={s.btnIcon}>📷</span>
        {t("photoInput.camera")}
      </button>
      <button type="button" className={s.btn} onClick={handleGallery}>
        <span className={s.btnIcon}>🖼️</span>
        {t("photoInput.gallery")}
      </button>
    </>
  ) : (
    <button
      type="button"
      className={`${s.btn} ${s.btnFull}`}
      onClick={handleGallery}
    >
      <span className={s.btnIcon}>📁</span>
      {hasPhoto ? t("photoInput.replace") : t("photoInput.chooseFile")}
    </button>
  );

  return (
    <div
      className={[s.photoInput, compact && s.compact, error && s.hasError]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={s.fieldLabel}>
        {fieldLabel}
        {required && <span className={s.required}> *</span>}
      </div>

      <div className={s.card}>
        {hasPhoto ? (
          <img
            src={value.src}
            alt={t("photoInput.selectedAlt")}
            className={s.photoPreview}
          />
        ) : (
          <>
            <div className={s.cardIcon}>📷</div>
            <div className={s.cardTitle}>{t("photoInput.addResultPhoto")}</div>
            <div className={s.cardHint}>{t("photoInput.reportingHint")}</div>
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

      {cameraError && <div className={s.fieldError}>{cameraError}</div>}

      {error && (
        <div className={s.fieldError}>
          {t("photoInput.requiredField", { label: fieldLabel })}
        </div>
      )}
    </div>
  );
}
