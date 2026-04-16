import s from "./Footer.module.scss";

const NAV = [
  { key: "",    icon: "⊞", label: "Главная" },
  { key: "add", icon: "+", label: "Добавить", fab: true },
  { key: "db",  icon: "☰", label: "База",    badge: true },
  { key: "map", icon: "◎", label: "Карта" },
];

export default function Footer({ page, setPage, openCount = 0 }) {
  return (
    <footer className={s.nav}>
      {NAV.map((item) =>
        item.fab ? (
          <button
            key="add"
            className={s.fab}
            onClick={() => setPage("add")}
            aria-label="Добавить утечку"
          >
            <span className={s.fabIcon}>+</span>
          </button>
        ) : (
          <button
            key={item.key || "home"}
            className={`${s.item} ${page === item.key ? s.active : ""}`}
            onClick={() => setPage(item.key)}
          >
            <span className={s.iconWrap}>
              <span className={s.icon}>{item.icon}</span>
              {item.badge && openCount > 0 && (
                <span className={s.badge}>{openCount > 99 ? "99+" : openCount}</span>
              )}
            </span>
            <span className={s.label}>{item.label}</span>
            {page === item.key && <span className={s.dot} />}
          </button>
        ),
      )}
    </footer>
  );
}
