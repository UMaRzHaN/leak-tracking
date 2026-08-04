import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MapPage/MapPage.module.scss";

function buildStatsLabel({ t, progress }) {
  const { stats } = progress;

  if (!stats) {
    return t("map.tilesSaved", { total: progress.total });
  }

  if (stats.saved === 0 && stats.alreadyCached === 0 && stats.failed > 0) {
    return t("map.tilesFailed", { failed: stats.failed });
  }

  const parts = [
    stats.saved > 0 ? t("map.tilesDownloaded", { count: stats.saved }) : null,
    stats.alreadyCached > 0
      ? t("map.tilesAlreadyCached", { count: stats.alreadyCached })
      : null,
    stats.failed > 0 ? t("map.tilesFailedPart", { count: stats.failed }) : null,
  ];

  return parts.filter(Boolean).join(", ");
}

export default function TileProgress({ progress }) {
  const { t } = useLanguage();

  if (!progress) return null;

  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const label =
    progress.status === "success"
      ? `✓ ${buildStatsLabel({ t, progress })}`
      : progress.status === "error"
        ? progress.stats
          ? `✕ ${buildStatsLabel({ t, progress })}`
          : t("map.downloadFailed")
        : progress.status === "cancelled"
          ? t("map.downloadCancelled", {
              done: progress.done,
              total: progress.total,
            })
          : t("map.downloading", { percent });

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
