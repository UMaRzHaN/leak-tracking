import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MapPage/MapPage.module.scss";

export default function TileProgress({ progress }) {
  const { lang } = useLanguage();

  if (!progress) return null;

  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const label =
    progress.status === "success"
      ? lang === "ru"
        ? `✓ Сохранено ${progress.total} тайлов`
        : `✓ Saved ${progress.total} tiles`
      : progress.status === "error"
        ? lang === "ru"
          ? "✕ Ошибка скачивания"
          : "✕ Download failed"
        : lang === "ru"
          ? `Загрузка ${percent}%`
          : `Downloading ${percent}%`;

  return (
    <div
      className={`${s.tileProgress} ${
        progress.status ? s[`tileProgress_${progress.status}`] : ""
      }`}
    >
      {!progress.status && (
        <div className={s.tileProgressBar} style={{ width: `${percent}%` }} />
      )}
      <span className={s.tileProgressLabel}>{label}</span>
    </div>
  );
}
