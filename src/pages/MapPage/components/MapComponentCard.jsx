import { useLanguage } from "@/app/hooks/useLanguage";
import { distanceMeters } from "@/utils/geoUtils";
import { formatLeakDate } from "@/utils/locale";
import { timeAgo } from "@/utils/timeAgo";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import s from "./MapLeakCard.module.scss";

function formatDistance(metres, t) {
  return metres >= 1000
    ? t("leakDetails.distanceKm", { count: (metres / 1000).toFixed(1) })
    : t("leakDetails.distanceM", { count: Math.round(metres) });
}

/**
 * Карточка булавки компонента — та же раскладка снизу, что у утечки, но со
 * сведениями железа: состояние, присвоенный номер, наименование и номер на
 * схеме, место, когда осматривали, снимок.
 */
export default function MapComponentCard({
  component,
  coords,
  onCheck = /** @type {((component: any) => void)|null} */ (null),
  onOpen,
}) {
  const { lang, t } = useLanguage();
  const photo = usePhotoSrc(component.photo ?? null);
  const status = String(component.component_status ?? "").trim();
  const place = component.location || component.address || "";
  const details = [component.component || t("components.unnamed")]
    .concat(
      component.scheme_tag
        ? `${t("map.popup.schemeTag")}: ${component.scheme_tag}`
        : [],
    )
    .join(" · ");
  const seenAt = component.inspected_at || component.date;
  const seen = seenAt
    ? (timeAgo(seenAt, lang) ?? formatLeakDate(seenAt, {}, lang))
    : null;
  const distance =
    Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
      ? distanceMeters(coords.lat, coords.lng, component.lat, component.lng)
      : null;

  return (
    <section
      className={s.card}
      aria-label={`${t("map.popup.componentTag")} ${component.leak_id ?? ""}`}
    >
      <div className={s.head}>
        {status && <span className={s.chip}>{status}</span>}
        <strong className={s.num}>№ {component.leak_id || "—"}</strong>
        {distance != null && (
          <span className={s.distance}>{formatDistance(distance, t)}</span>
        )}
      </div>
      <div className={s.main}>
        <div className={s.text}>
          <p className={s.place}>
            {place || t("components.noLocation")}
            {component.object && (
              <span className={s.object}>{component.object}</span>
            )}
          </p>
          <p className={s.details}>{details}</p>
          {seen && (
            <div className={s.chips}>
              <span className={s.chip}>{seen}</span>
            </div>
          )}
        </div>
        {photo && <img className={s.photo} src={photo} alt="" />}
      </div>
      {onOpen && (
        <div className={s.actions}>
          {onCheck && (
            <button
              type="button"
              className={s.secondary}
              onClick={() => onCheck(component)}
            >
              {t("reconcile.check")}
            </button>
          )}
          <button
            type="button"
            className={s.primary}
            onClick={() => onOpen(component)}
          >
            {t("map.card.open")}
          </button>
        </div>
      )}
    </section>
  );
}
