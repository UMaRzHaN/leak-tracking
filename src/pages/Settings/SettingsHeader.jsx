import s from "./SettingsHeader.module.scss";

export default function SettingsHeader({ onBack }) {
  return (
    <div className={s.header}>
      <button
        className={s.backBtn}
        onClick={onBack}
        title="Вернуться на главную"
      >
        ←
      </button>

      <h1 className={s.title}>Настройки</h1>
    </div>
  );
}
