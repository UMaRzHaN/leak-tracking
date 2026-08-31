import s from "@/pages/MapPage/MapPage.module.scss";

/**
 * Значок кнопки отбора: список со строками разной длины.
 *
 * Одна на все базы — у статуса утечки и у состояния железа он был нарисован
 * дважды, и это одиннадцать одинаковых строк, которые рано или поздно
 * разошлись бы.
 */
export default function FilterIcon() {
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
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}
