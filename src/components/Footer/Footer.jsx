import s from "./Footer.module.scss";

const items = [
  { key: "map", icon: "🗺️", label: "Map" },
  { key: "", icon: "🏠", label: "Home" },
  { key: "settings", icon: "⚙️", label: "Settings" },
];

export default function Footer({ page, setPage, settingsMode, onEditClick }) {
  // Если мы в режиме Settings, показываем только кнопку параметров
  if (settingsMode) {
    return (
      <footer className={s.bottomNav}>
        <button
          className={s.navItem}
          onClick={onEditClick}
          title="Редактировать параметры расчёта"
        >
          <span className={s.navIcon}>⚙️</span>
          <span className={s.navLabel}>Параметры</span>
        </button>
      </footer>
    );
  }

  return (
    <footer className={s.bottomNav}>
      {items.map((item) => (
        <button
          key={item.key || "home"}
          className={`${s.navItem} ${page === item.key ? s.active : ""}`}
          onClick={() => setPage(item.key)}
        >
          <span className={s.navIcon}>{item.icon}</span>
          <span className={s.navLabel}>{item.label}</span>
        </button>
      ))}
    </footer>
  );
}
