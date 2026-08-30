import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import s from "./PhotoViewer.module.scss";

export default function PhotoViewer({
  src = /** @type {string|null} */ (null),
  photos = /** @type {(string|null)[]|null} */ (null),
  labels = /** @type {string[]|null} */ (null),
  initialIndex = 0,
  onClose,
}) {
  const { t } = useTranslation();
  const photoList = photos ?? (src ? [src] : []);
  const labelList = labels ?? [];
  const [idx, setIdx] = useState(initialIndex);

  const canPrev = idx > 0;
  const canNext = idx < photoList.length - 1;
  const currentSrc = photoList[idx];
  const currentLabel = labelList[idx] ?? null;

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && canPrev) setIdx((i) => i - 1);
      if (e.key === "ArrowRight" && canNext) setIdx((i) => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, canPrev, canNext]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!currentSrc) return null;

  return createPortal(
    <div
      className={s.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        className={s.closeBtn}
        onClick={onClose}
        aria-label={t("common.close")}
      >
        ✕
      </button>

      {canPrev && (
        <button
          className={`${s.navBtn} ${s.navBtnLeft}`}
          onClick={(e) => {
            e.stopPropagation();
            setIdx((i) => i - 1);
          }}
          aria-label={t("photoViewer.previous")}
        >
          <svg
            width="11"
            height="20"
            viewBox="0 0 11 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9.5 1.5L1.5 10L9.5 18.5"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {canNext && (
        <button
          className={`${s.navBtn} ${s.navBtnRight}`}
          onClick={(e) => {
            e.stopPropagation();
            setIdx((i) => i + 1);
          }}
          aria-label={t("photoViewer.next")}
        >
          <svg
            width="11"
            height="20"
            viewBox="0 0 11 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1.5 1.5L9.5 10L1.5 18.5"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <div className={s.imgWrap}>
        <img
          key={idx}
          src={currentSrc}
          alt={currentLabel ?? t("photoViewer.photoAlt")}
          className={s.img}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {currentLabel && photoList.length > 1 && (
        <span className={s.photoLabel}>{currentLabel}</span>
      )}

      <p className={s.hint}>
        {photoList.length > 1
          ? t("photoViewer.navigationHint", {
              current: idx + 1,
              total: photoList.length,
            })
          : t("photoViewer.closeHint")}
      </p>
    </div>,
    document.body,
  );
}
