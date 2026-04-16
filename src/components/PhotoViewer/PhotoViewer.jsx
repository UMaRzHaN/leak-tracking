import { useEffect } from "react";
import s from "./PhotoViewer.module.scss";

export default function PhotoViewer({ src, onClose }) {
  /* ── Close on Escape ── */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ── Prevent body scroll ── */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!src) return null;

  return (
    <div className={s.overlay} onClick={onClose} role="dialog" aria-modal="true">
      {/* Close button */}
      <button className={s.closeBtn} onClick={onClose} aria-label="Закрыть">
        ✕
      </button>

      {/* Image — stop propagation so tapping the image doesn't close */}
      <div
        className={s.imgWrap}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt="Фото утечки"
          className={s.img}
          draggable={false}
        />
      </div>

      <p className={s.hint}>Нажмите за пределами фото, чтобы закрыть</p>
    </div>
  );
}
