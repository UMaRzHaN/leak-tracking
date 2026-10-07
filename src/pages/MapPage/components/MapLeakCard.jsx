import { useLanguage } from "@/app/hooks/useLanguage";
import { distanceMeters } from "@/utils/geoUtils";
import { formatCompactNumber, formatNumber } from "@/utils/locale";
import { getLeakDetailsHeroPhotoPath } from "@/utils/monitoring";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { STATUS } from "@/utils/status";
import StatusBadge from "@/components/ui/StatusBadge/StatusBadge";
import s from "./MapLeakCard.module.scss";

function formatDistance(metres, t) {
  return metres >= 1000
    ? t("leakDetails.distanceKm", { count: (metres / 1000).toFixed(1) })
    : t("leakDetails.distanceM", { count: Math.round(metres) });
}

/** Число как в карточке списка: крупные — сокращённо («~13 млн»). */
function formatAmount(value, decimals, lang) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const number = Number(value);
  const options = { maximumFractionDigits: decimals };
  return Math.abs(number) >= 1_000
    ? formatCompactNumber(number, options, lang)
    : formatNumber(number, options, lang);
}

/**
 * Карточка булавки (5d): своя компактная раскладка поверх карты, но с теми
 * же сведениями, что карточка утечки в списке, — место и объект, компонент и
 * описание, расход и выбросы, снимок, — и два действия: проверить или
 * открыть запись.
 */
export default function MapLeakCard({ leak, coords, onMonitor, onOpen }) {
  const { lang, t } = useLanguage();
  const photo = usePhotoSrc(getLeakDetailsHeroPhotoPath(leak));
  const place = leak.location || leak.address || "";
  const details = [leak.component, leak.leak_description]
    .filter(Boolean)
    .join(" · ");
  const methane = formatAmount(leak.Total_Annual_Methane_Loss_m3_y, 0, lang);
  const emissions = formatAmount(leak.Emissions_t_CO2eq_year, 2, lang);
  const chips = [
    leak.leak_speed != null
      ? `${leak.leak_speed} ${t("common.units.litresPerMinute")}`
      : null,
    methane != null
      ? `~${methane} ${t("common.units.cubicMetresPerYear")}`
      : null,
    emissions != null
      ? `~${emissions} ${t("common.units.tonnesCo2PerYear")}`
      : null,
  ].filter(Boolean);
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
      data-priority={leak.priority ?? "none"}
      aria-label={`${t("map.popup.tag")} ${leak.leak_id ?? ""}`}
    >
      <div className={s.head}>
        <StatusBadge status={leak.status ?? STATUS.OPEN} size="sm" />
        <strong className={s.num}>№ {leak.leak_id ?? "—"}</strong>
        {distance != null && (
          <span className={s.distance}>{formatDistance(distance, t)}</span>
        )}
      </div>
      <div className={s.main}>
        <div className={s.text}>
          {place && (
            <p className={s.place}>
              {place}
              {leak.object && <span className={s.object}>{leak.object}</span>}
            </p>
          )}
          {details && <p className={s.details}>{details}</p>}
          {chips.length > 0 && (
            <div className={s.chips}>
              {chips.map((chip) => (
                <span key={chip} className={s.chip}>
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
        {photo && <img className={s.photo} src={photo} alt="" />}
      </div>
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
