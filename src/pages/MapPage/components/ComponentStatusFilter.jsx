import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MapPage/MapPage.module.scss";
import FilterIcon from "./FilterIcon";

/**
 * Отбор булавок по состоянию железа.
 *
 * Только на базе компонентов — ровно как статус утечки только на своей: с
 * задвижкой не «разбираются», у неё нет ни приоритета, ни обхода, и кнопок
 * этих трёх карта здесь не показывает.
 *
 * Отбор общий с реестром: выбранное там видно здесь, и наоборот. Своего
 * состояния у кнопки нет — она показывает то, что лежит в общем наборе.
 */
export default function ComponentStatusFilter({
  shown,
  statuses = /** @type {string[]} */ ([]),
  selected = /** @type {string[]} */ ([]),
  open,
  onToggleMenu,
  onToggle,
  onClear,
}) {
  const { t } = useLanguage();
  if (!shown || statuses.length === 0) return null;

  const chosen = new Set(selected);

  return (
    <div className={s.filterControlWrap}>
      <button
        type="button"
        className={`${s.controlBtn} ${chosen.size > 0 ? s.controlBtnActive : ""}`}
        onClick={onToggleMenu}
        aria-expanded={open}
        aria-label={t("map.componentStatusFilter")}
      >
        <FilterIcon />
      </button>
      <div className={`${s.filterFlyout} ${open ? s.filterFlyoutOpen : ""}`}>
        <button type="button" className={s.filterOptionBtn} onClick={onClear}>
          {t("map.all")}
        </button>
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            className={`${s.filterOptionBtn} ${
              chosen.has(status) ? s.filterOptionBtnActive : ""
            }`}
            aria-pressed={chosen.has(status)}
            onClick={() => onToggle(status)}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
