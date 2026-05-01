import s from "@/pages/MapPage/MapPage.module.scss";

export default function TileProgress({ progress }) {
  if (!progress) return null;

  return (
    <div
      className={`${s.tileProgress} ${
        progress.status ? s[`tileProgress_${progress.status}`] : ""
      }`}
    >
      {!progress.status && (
        <div
          className={s.tileProgressBar}
          style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
        />
      )}
      <span className={s.tileProgressLabel}>
        {progress.status === "success"
          ? `✓ Сохранено ${progress.total} тайлов`
          : progress.status === "error"
          ? "✕ Ошибка скачивания"
          : `Загрузка ${Math.round((progress.done / progress.total) * 100)}%`}
      </span>
    </div>
  );
}
