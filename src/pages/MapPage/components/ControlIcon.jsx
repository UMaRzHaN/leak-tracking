import s from "@/pages/MapPage/MapPage.module.scss";

/**
 * Значок кнопки карты: общий холст и штрих, разное — только рисунок внутри.
 *
 * Те же семь атрибутов `<svg>` стояли у каждой кнопки столбца по отдельности,
 * и толщина линии у них расходилась бы с первой же правкой одной из них.
 */
export default function ControlIcon({ children }) {
  return (
    <svg
      className={s.controlIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
