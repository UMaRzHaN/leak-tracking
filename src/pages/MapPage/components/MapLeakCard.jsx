import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { normalizeLocationValue } from "@/utils/locationFilter";
import { distanceMeters } from "@/utils/geoUtils";
import { STATUS } from "@/utils/status";
import StatusBadge from "@/components/ui/StatusBadge/StatusBadge";
import s from "./MapLeakCard.module.scss";

function formatDistance(metres, t) {
  return metres >= 1000
    ? t("leakDetails.distanceKm", { count: (metres / 1000).toFixed(1) })
    : t("leakDetails.distanceM", { count: Math.round(metres) });
}

/**
 * Карточка булавки (5d): что за точка и два действия — проверить или
 * открыть запись. Вместо всплывающей подсказки Leaflet: та закрывала соседние
 * булавки и не давала ничего сделать, только прочитать.
 */
export default function MapLeakCard({ leak, coords, onMonitor, onOpen }) {
  const { t } = useLanguage();
  const { project } = useProjectData();
  const levelKeys = getLocationLevelKeys(PROJECT_LOCATION_CONFIG[project]);
  const place = levelKeys
    .slice(-2)
    .map((key) => normalizeLocationValue(leak?.[key]))
    .filter(Boolean)
    .join(" · ");
  const details = [
    leak.component,
    leak.leak_speed != null
      ? `${leak.leak_speed} ${t("common.units.litresPerMinute")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lat = Number(leak.lat);
  const lng = Number(leak.lng);
  const distance =
    Number.isFinite(coords?.lat) &&
    Number.isFinite(coords?.lng) &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
      ? distanceMeters(coords.lat, coords.lng, lat, lng)
      : null;

  return (
    <section
      className={s.card}
      data-status={leak.status ?? STATUS.OPEN}
      aria-label={`${t("map.popup.tag")} ${leak.leak_id ?? ""}`}
    >
      <div className={s.head}>
        <StatusBadge
          status={leak.status ?? STATUS.OPEN}
          size="sm"
          onClick={null}
        />
        <strong className={s.num}>№ {leak.leak_id ?? "—"}</strong>
        {distance != null && (
          <span className={s.distance}>{formatDistance(distance, t)}</span>
        )}
      </div>
      {place && <p className={s.place}>{place}</p>}
      {details && <p className={s.details}>{details}</p>}
      <div className={s.actions}>
        {onMonitor && (
          <button
            type="button"
            className={s.secondary}
            onClick={() => onMonitor(leak)}
          >
            {t("map.card.check")}
          </button>
        )}
        <button
          type="button"
          className={s.primary}
          onClick={() => onOpen(leak)}
        >
          {t("map.card.open")}
        </button>
      </div>
    </section>
  );
}
