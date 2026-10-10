import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/DataBase/DataBase.module.scss";

/**
 * «Рядом со мной» в панели фильтров базы: переключатель и, пока он включён,
 * выбор радиуса.
 *
 * Показывается только при живых координатах — без них «рядом» не с чем
 * сравнивать, — и решает это вызывающий.
 */
export default function NearbyFilterSection({
  enabled,
  onToggle,
  count,
  radius,
  radiusOptions,
  onRadiusChange,
}) {
  const { t } = useLanguage();
  const formatRadius = (value) =>
    value >= 1000
      ? `${value / 1000} ${t("database.radiusKm")}`
      : `${value} ${t("database.radiusM")}`;

  return (
    <>
      <div className={s.filterDivider} />
      <button
        className={`${s.nearbyToggle} ${enabled ? s.nearbyToggleActive : ""}`}
        onClick={onToggle}
      >
        <span className={s.nearbyLeft}>
          <span className={s.nearbyIcon}>📌</span>
          <span className={s.nearbyLabel}>{t("database.nearMe")}</span>
          {count > 0 && <span className={s.nearbyCount}>{count}</span>}
        </span>
        <span className={`${s.nearbyTrack} ${enabled ? s.nearbyTrackOn : ""}`}>
          <span
            className={`${s.nearbyThumb} ${enabled ? s.nearbyThumbOn : ""}`}
          />
        </span>
      </button>
      {enabled && (
        <div className={s.nearbyRadiusGroup}>
          {radiusOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`${s.nearbyRadiusBtn} ${
                radius === option ? s.nearbyRadiusBtnActive : ""
              }`}
              onClick={() => onRadiusChange(option)}
            >
              {formatRadius(option)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
