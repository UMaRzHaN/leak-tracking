import s from "./Footer.module.scss";

const items = [
  { key: "map", icon: "🗺️", label: "Map" },
  { key: "", icon: "🏠", label: "Home" },
  { key: "settings", icon: "⚙️", label: "Settings" },
];

export default function Footer({ page, setPage }) {
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
