import { useLanguage } from "@/app/hooks/useLanguage";
import { distanceMeters } from "@/utils/geoUtils";
import { getStatusMeta } from "@/utils/status";
import Icon from "@/components/ui/Icon/Icon";
import { formatDistance } from "./routePlan";
import s from "./RouteBanner.module.scss";

/**
 * Плашка активного маршрута на карте (5d). На время маршрута она встаёт на
 * место строки поиска, поэтому в ней две строки: бирка с компонентом и
 * «N/M · сколько до цели · статус» — и тонкая полоса прогресса по краю.
 * Сегментов нет — точек бывает больше сотни. Тап по плашке показывает цель
 * на карте с её карточкой — проверка начинается оттуда.
 */
export default function RouteBanner({
  progress,
  coords,
  gpsEnabled,
  onFocus,
  onEnd,
}) {
  const { t, lang } = useLanguage();
  if (!progress) return null;

  const target = progress.current;
  const meters =
    target && gpsEnabled && Number.isFinite(coords?.lat)
      ? distanceMeters(coords.lat, coords.lng, target.lat, target.lng)
      : null;
  const units = { m: t("route.m"), km: t("route.km") };
  // По бирке обходчик узнаёт точку на месте; компонент — рядом с ней.
  const component = String(target?.component ?? "").trim();
  const title = target
    ? [`${t("route.tag")} ${target.leak_id ?? "—"}`, component]
        .filter(Boolean)
        .join(" · ")
    : t("route.finished");
  const meta = target
    ? [
        t("route.stepShort", { step: progress.step, total: progress.total }),
        meters !== null && Number.isFinite(meters)
          ? formatDistance(meters, lang, units)
          : null,
        getStatusMeta(target.status, t).label,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("route.finishedHint");
  const percent = Math.round((progress.done / progress.total) * 100);

  return (
    <div className={s.banner} role="status">
      <button
        type="button"
        className={s.main}
        onClick={() => target && onFocus(target)}
        disabled={!target}
        aria-label={
          target
            ? `${t("route.step", { step: progress.step, total: progress.total })}: ${title}`
            : undefined
        }
      >
        <span className={s.title}>{title}</span>
        <span className={s.meta}>{meta}</span>
      </button>

      <button
        type="button"
        className={s.end}
        onClick={onEnd}
        aria-label={t("route.end")}
        title={t("route.end")}
      >
        <Icon name="close" size={14} strokeWidth={2} />
      </button>

      <span
        className={s.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
