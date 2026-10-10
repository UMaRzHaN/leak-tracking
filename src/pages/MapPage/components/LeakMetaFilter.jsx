import { useLanguage } from "@/app/hooks/useLanguage";
import s from "@/pages/MapPage/MapPage.module.scss";

/**
 * Отбор утечек по признаку с цветом: статусу или приоритету.
 *
 * Оба отбора устроены одинаково — «все» и по варианту на каждое значение,
 * выбранное подсвечено цветом своего значения, — и жили в столбце кнопок двумя
 * одинаковыми копиями. Различаются только список значений, описание каждого и
 * значок кнопки.
 *
 * @param {{
 *   label: string,
 *   icon: import("react").ReactNode,
 *   order: string[],
 *   getMeta: (value: string, t: any) => {short: string, border: string, color: string, bg: string},
 *   selected: string[],
 *   open: boolean,
 *   onToggleMenu: () => void,
 *   onToggle: (value: string) => void,
 *   onClear: () => void,
 * }} props
 */
export default function LeakMetaFilter({
  label,
  icon,
  order,
  getMeta,
  selected,
  open,
  onToggleMenu,
  onToggle,
  onClear,
}) {
  const { t } = useLanguage();
  const chosen = new Set(selected);

  return (
    <div className={s.filterControlWrap}>
      <button
        type="button"
        className={`${s.controlBtn} ${chosen.size > 0 ? s.controlBtnActive : ""}`}
        onClick={onToggleMenu}
        aria-expanded={open}
        aria-label={label}
      >
        {icon}
      </button>
      <div className={`${s.filterFlyout} ${open ? s.filterFlyoutOpen : ""}`}>
        <button type="button" className={s.filterOptionBtn} onClick={onClear}>
          {t("map.all")}
        </button>
        {order.map((value) => {
          const meta = getMeta(value, t);
          const isActive = chosen.has(value);
          return (
            <button
              key={value}
              type="button"
              className={`${s.filterOptionBtn} ${
                isActive ? s.filterOptionBtnActive : ""
              }`}
              style={
                isActive
                  ? {
                      borderColor: meta.border,
                      color: meta.color,
                      background: meta.bg,
                    }
                  : undefined
              }
              onClick={() => onToggle(value)}
            >
              {meta.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
