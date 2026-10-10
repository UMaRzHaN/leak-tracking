import { fieldLabel } from "@/utils/fieldLabels";
import { distanceMeters } from "@/utils/geoUtils";
import { useCurrentPosition } from "@/app/currentPosition";
import { requestMapFocus } from "@/app/mapFocus";
import { STATUS } from "@/utils/status";
import CoordsMapPreview from "./CoordsMapPreview";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/**
 * Точность отдельной строкой, а не колонкой координат.
 *
 * Соседи форматируются с шестью знаками после запятой — это верно для широты и
 * долготы и бессмысленно для радиуса в метрах: «12.000000» вместо «±12 м».
 * И читается она иначе: это не третья координата, а мера доверия к первым двум.
 */
function accuracyMetres(data) {
  const value = Number(data?.coords_accuracy);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function formatDistance(metres, t) {
  return metres >= 1000
    ? t("leakDetails.distanceKm", { count: (metres / 1000).toFixed(1) })
    : t("leakDetails.distanceM", { count: Math.round(metres) });
}

const PIN_COLOR = {
  [STATUS.OPEN]: "var(--c-open)",
  [STATUS.IN_PROGRESS]: "var(--c-progress)",
  [STATUS.RESOLVED]: "var(--c-resolved)",
};

/**
 * Вкладка «Координаты» (5e): снимок карты с точкой, координаты, точность,
 * расстояние до человека и переход на карту.
 */
export default function LeakLocationSection({ data, fields, localeTexts, t }) {
  const position = useCurrentPosition();
  const accuracy = accuracyMetres(data);
  const hasAny = fields.some(
    (field) => data[field.key] != null && data[field.key] !== "",
  );
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  const located = Number.isFinite(lat) && Number.isFinite(lng);
  const fromYou =
    located && position
      ? distanceMeters(position.lat, position.lng, lat, lng)
      : null;

  if (!hasAny) {
    return (
      <div className={s.tabPane}>
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📍</span>
          <p>{localeTexts.empty.coords}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${s.tabPane} ${s.coordsPane}`}>
      <div className={s.coordsCard}>
        {located && (
          <CoordsMapPreview
            lat={lat}
            lng={lng}
            color={PIN_COLOR[data.status ?? STATUS.OPEN] ?? PIN_COLOR.open}
          />
        )}
        {fields.map(({ key, label }) => {
          const value = data[key];
          if (value == null || value === "") return null;
          return (
            <div key={key} className={s.fieldRow}>
              <span className={s.fieldLabel}>{fieldLabel(key, t, label)}</span>
              <span className={s.fieldValue}>{Number(value).toFixed(6)}</span>
            </div>
          );
        })}
        {accuracy != null && (
          <div className={s.fieldRow}>
            <span className={s.fieldLabel}>
              {t("leakDetails.coordsAccuracy")}
            </span>
            <span className={s.fieldValue}>
              {t("leakDetails.coordsAccuracyValue", { count: accuracy })}
            </span>
          </div>
        )}
        {fromYou != null && (
          <div className={s.fieldRow}>
            <span className={s.fieldLabel}>{t("leakDetails.fromYou")}</span>
            <span className={s.fieldValue}>{formatDistance(fromYou, t)}</span>
          </div>
        )}
      </div>

      {located && (
        <button
          type="button"
          className={s.coordsShowMap}
          onClick={() => requestMapFocus({ lat, lng })}
        >
          {t("leakDetails.showOnMap")}
        </button>
      )}
    </div>
  );
}
