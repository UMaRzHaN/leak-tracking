import s from "../MapPage.module.scss";

export default function MapControls({ onLocate, onOpenSheet, onDownload, downloading }) {
  return (
    <div className={s.controls}>
      <button
        type="button"
        className={s.controlBtn}
        onClick={onLocate}
        aria-label="Моё местоположение"
      >
        <svg
          className={s.controlIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      <button
        type="button"
        className={s.controlBtn}
        onClick={onOpenSheet}
        aria-label="Поиск утечек"
      >
        <svg
          className={s.controlIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
      </button>

      <button
        type="button"
        className={`${s.controlBtn} ${downloading ? s.controlBtnActive : ""}`}
        onClick={onDownload}
        disabled={downloading}
        aria-label="Скачать карту текущей области"
      >
        <svg
          className={s.controlIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v13M7 11l5 5 5-5" />
          <path d="M3 19h18" />
        </svg>
      </button>
    </div>
  );
}
