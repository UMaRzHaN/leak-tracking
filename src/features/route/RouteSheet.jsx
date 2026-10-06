import { useId, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { normalizeLocationValue } from "@/utils/locationFilter";
import Icon from "@/components/ui/Icon/Icon";
import { readMonitoringRound } from "@/utils/monitoringRound";
import { formatDistance, planRoute, routeCandidates } from "./routePlan";
import s from "./RouteSheet.module.scss";

/**
 * Лист маршрута по точкам (5a/5b): центральная кнопка нижней панели
 * мониторинга. Точки — всё, что к проверке в текущем обходе, порядок — от
 * текущего места к ближайшей. Внешний навигатор не предлагается: маршрут ведётся
 * внутри приложения, плашкой на карте.
 */
export default function RouteSheet({
  open,
  leaks,
  coords,
  gpsEnabled,
  onClose,
  onShowMap,
  onStart,
}) {
  const { t, lang } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ open, onClose });
  const { project, activeProject } = useProjectData();
  // Обход читается при открытии листа, как и место ниже.
  const [round] = useState(() =>
    readMonitoringRound(activeProject?.id ?? null),
  );

  // Место берётся на момент открытия листа: порядок не должен перестраиваться
  // под пальцем на каждый шаг GPS, пока список читают.
  const [origin] = useState(() =>
    gpsEnabled && Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)
      ? { lat: coords.lat, lng: coords.lng }
      : null,
  );
  const plan = useMemo(
    () => planRoute(routeCandidates(leaks, round), origin),
    [leaks, round, origin],
  );
  const levelKeys = getLocationLevelKeys(PROJECT_LOCATION_CONFIG[project]);
  const units = { m: t("route.m"), km: t("route.km") };

  if (!open) return null;

  const placeOf = (leak) =>
    levelKeys
      .slice(-2)
      .map((key) => normalizeLocationValue(leak?.[key]))
      .filter(Boolean)
      .join(" · ");

  return (
    <div className={s.root}>
      <div className={s.backdrop} data-modal-backdrop="" onClick={onClose} />
      <div
        ref={dialogRef}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <span className={s.handle} aria-hidden="true" />

        <div className={s.head}>
          <div className={s.headText}>
            <h2 id={titleId}>{t("route.title")}</h2>
            <p>
              {plan.stops.length
                ? t("route.summary", {
                    count: plan.stops.length,
                    distance: formatDistance(plan.totalMeters, lang, units),
                  })
                : t("route.empty")}
            </p>
          </div>
          <button
            type="button"
            className={s.close}
            onClick={onClose}
            aria-label={t("route.close")}
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <ol className={s.stops}>
          <li className={s.origin}>
            <span className={s.originDot} aria-hidden="true" />
            <span className={s.stopText}>
              <span className={s.stopName}>{t("route.origin")}</span>
              <span className={s.stopSub}>
                {origin ? t("route.gpsOn") : t("route.gpsOff")}
              </span>
            </span>
          </li>
          {plan.stops.map(({ leak, legMeters }, index) => (
            <li key={leak.id} className={s.stop}>
              <span className={s.badge}>{index + 1}</span>
              <span className={s.stopText}>
                <span className={s.stopName}>
                  {placeOf(leak) || `${t("route.tag")} ${leak.leak_id ?? "—"}`}
                </span>
                <span className={s.stopSub}>
                  {t("route.tag")} {leak.leak_id ?? "—"}
                </span>
              </span>
              <span className={s.stopDistance}>
                {origin || index > 0
                  ? formatDistance(legMeters, lang, units)
                  : ""}
              </span>
            </li>
          ))}
        </ol>

        <div className={s.actions}>
          <button type="button" className={s.secondary} onClick={onShowMap}>
            {t("route.showMap")}
          </button>
          <button
            type="button"
            className={s.primary}
            disabled={!plan.stops.length}
            onClick={() => onStart(plan.stops.map((stop) => stop.leak.id))}
          >
            {t("route.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
