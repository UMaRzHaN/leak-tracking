import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MapPage/MapPage.module.scss";

function buildStatsLabel({ lang, progress }) {
  const { stats } = progress;

  if (!stats) {
    return lang === "ru"
      ? `Сохранено ${progress.total} тайлов`
      : `Saved ${progress.total} tiles`;
  }

  if (stats.saved === 0 && stats.alreadyCached === 0 && stats.failed > 0) {
    return lang === "ru"
      ? `Не удалось скачать ${stats.failed} тайлов`
      : `Failed to download ${stats.failed} tiles`;
  }

  const parts =
    lang === "ru"
      ? [
          stats.saved > 0 ? `скачано ${stats.saved}` : null,
          stats.alreadyCached > 0 ? `уже было ${stats.alreadyCached}` : null,
          stats.failed > 0 ? `не удалось ${stats.failed}` : null,
        ]
      : [
          stats.saved > 0 ? `downloaded ${stats.saved}` : null,
          stats.alreadyCached > 0 ? `cached ${stats.alreadyCached}` : null,
          stats.failed > 0 ? `failed ${stats.failed}` : null,
        ];

  return parts.filter(Boolean).join(", ");
}

export default function TileProgress({ progress }) {
  const { lang } = useLanguage();

  if (!progress) return null;

  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const label =
    progress.status === "success"
      ? `✓ ${buildStatsLabel({ lang, progress })}`
      : progress.status === "error"
        ? progress.stats
          ? `✕ ${buildStatsLabel({ lang, progress })}`
          : lang === "ru"
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
