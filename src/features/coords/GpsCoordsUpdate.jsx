import { useLanguage } from "@/app/hooks/useLanguage";
import { useCurrentPosition } from "@/app/currentPosition";
import { distanceMeters } from "@/utils/geoUtils";
import Icon from "@/components/ui/Icon/Icon";
import s from "./GpsCoordsUpdate.module.scss";

function formatDistance(metres, t) {
  return metres >= 1000
    ? t("leakDetails.distanceKm", { count: (metres / 1000).toFixed(1) })
    : t("leakDetails.distanceM", { count: Math.round(metres) });
}

/**
 * «Обновить координаты по GPS» — одной кнопкой, когда записанная точка
 * оказалась не там: в проверке обхода и при правке карточки. Ставит текущую
 * позицию вместе с точностью приёмника; пока не сохранили, её можно отменить.
 *
 * @param {{
 *   current: {lat?: any, lng?: any}|null,
 *   applied: {lat: number, lng: number, accuracy?: number}|null,
 *   onApply: (coords: {lat: number, lng: number, accuracy?: number}|null) => void,
 * }} props
 */
export default function GpsCoordsUpdate({ current, applied, onApply }) {
  const { t } = useLanguage();
  const position = useCurrentPosition();
  const lat = Number(current?.lat);
  const lng = Number(current?.lng);
  const hasCurrent = Number.isFinite(lat) && Number.isFinite(lng);
  const shift =
    position && hasCurrent
      ? distanceMeters(lat, lng, position.lat, position.lng)
      : null;
  const accuracy =
    position?.accuracy != null ? Math.round(position.accuracy) : null;

  if (applied) {
    return (
      <div className={s.box} data-applied="true">
        <span className={s.icon}>
          <Icon name="pin" size={18} strokeWidth={1.8} />
        </span>
        <span className={s.text}>
          <strong>{t("coordsUpdate.applied")}</strong>
          <small>
            {applied.lat.toFixed(6)}, {applied.lng.toFixed(6)}
            {applied.accuracy != null &&
              ` · ±${Math.round(applied.accuracy)} ${t("common.units.meters")}`}
          </small>
        </span>
        <button type="button" className={s.undo} onClick={() => onApply(null)}>
          {t("coordsUpdate.undo")}
        </button>
      </div>
    );
  }

  return (
    <div className={s.box}>
      <span className={s.icon}>
        <Icon name="pin" size={18} strokeWidth={1.8} />
      </span>
      <span className={s.text}>
        <strong>{t("coordsUpdate.title")}</strong>
        <small>
          {!position
            ? t("coordsUpdate.noGps")
            : [
                shift != null &&
                  t("coordsUpdate.shift", {
                    distance: formatDistance(shift, t),
                  }),
                accuracy != null &&
                  t("coordsUpdate.accuracy", { count: accuracy }),
              ]
                .filter(Boolean)
                .join(" · ")}
        </small>
      </span>
      <button
        type="button"
        className={s.apply}
        disabled={!position}
        onClick={() =>
          position &&
          onApply({
            lat: position.lat,
            lng: position.lng,
            ...(position.accuracy != null
              ? { accuracy: position.accuracy }
              : {}),
          })
        }
      >
        {t("coordsUpdate.action")}
      </button>
    </div>
  );
}
