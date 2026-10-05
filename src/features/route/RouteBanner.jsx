import { useLanguage } from "@/app/hooks/useLanguage";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_LOCATION_CONFIG } from "@/configs/projectLocation.config";
import { getLocationLevelKeys } from "@/utils/locationTree";
import { normalizeLocationValue } from "@/utils/locationFilter";
import { distanceMeters } from "@/utils/geoUtils";
import Icon from "@/components/ui/Icon/Icon";
import { formatDistance } from "./routePlan";
import s from "./RouteBanner.module.scss";

/**
 * Плашка активного маршрута на карте (5d): «Маршрут · точка N из M», куда
 * идти, сколько до цели и сплошная полоса прогресса. Сегментов нет — точек
 * бывает больше сотни. Тап по плашке показывает цель на карте, «Проверить»
 * открывает проверку текущей точки.
 */
export default function RouteBanner({
  progress,
  coords,
  gpsEnabled,
  onFocus,
  onCheck,
  onEnd,
}) {
  const { t, lang } = useLanguage();
  const { project } = useProjectData();
  if (!progress) return null;

  const target = progress.current;
  const levelKeys = getLocationLevelKeys(PROJECT_LOCATION_CONFIG[project]);
  const place = target
    ? levelKeys
        .slice(-2)
        .map((key) => normalizeLocationValue(target[key]))
        .filter(Boolean)
        .join(" · ")
    : "";
  const meters =
    target && gpsEnabled && Number.isFinite(coords?.lat)
      ? distanceMeters(coords.lat, coords.lng, target.lat, target.lng)
      : null;
  const units = { m: t("route.m"), km: t("route.km") };
  const percent = Math.round((progress.done / progress.total) * 100);

  return (
    <div className={s.banner} role="status">
      <div className={s.row}>
        <button
          type="button"
          className={s.main}
          onClick={() => target && onFocus(target)}
          disabled={!target}
        >
          <span className={s.icon}>
            <Icon name={target ? "route" : "check"} size={17} strokeWidth={2} />
          </span>
          <span className={s.text}>
            <span className={s.step}>
              {target
                ? t("route.step", {
                    step: progress.step,
                    total: progress.total,
                  })
                : t("route.finished")}
            </span>
            <span className={s.target}>
              {target
                ? place || `${t("route.tag")} ${target.leak_id ?? "—"}`
                : t("route.finishedHint")}
            </span>
          </span>
          {meters !== null && Number.isFinite(meters) && (
            <span className={s.distance}>
              {formatDistance(meters, lang, units)}
            </span>
          )}
        </button>
        {target && (
          <button
            type="button"
            className={s.check}
            onClick={() => onCheck(target)}
          >
            {t("route.check")}
          </button>
        )}
      </div>

      <div className={s.row}>
        <span
          className={s.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
        <span className={s.left}>
          {t("route.left", { count: progress.left })}
        </span>
        <button
          type="button"
          className={s.end}
          onClick={onEnd}
          aria-label={t("route.end")}
          title={t("route.end")}
        >
          <Icon name="close" size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
