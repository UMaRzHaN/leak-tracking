import s from "./SettingsFooter.module.scss";

export default function SettingsFooter({ onEditClick }) {
  return (
    <button
      className={s.footer}
      onClick={onEditClick}
      title="Открыть редактор параметров расчёта газа"
    >
      <span className={s.icon}>⚙️</span>
      <span className={s.label}>Редактировать параметры</span>
    </button>
  );
}
