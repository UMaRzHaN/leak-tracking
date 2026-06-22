import { useMemo } from "react";
import s from "./Footer.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";

export default function Footer({ page, setPage, openCount = 0 }) {
  const { t } = useLanguage();
  const navItems = useMemo(
    () => [
      {
        key: "",
        icon: "⊞",
        label: t("footer.home"),
      },
      {
        key: "add",
        icon: "+",
        label: t("footer.add"),
        fab: true,
      },
      {
        key: "db",
        icon: "☰",
        label: t("footer.database"),
        badge: true,
      },
      {
        key: "map",
        icon: "◎",
        label: t("footer.map"),
      },
    ],
    [t],
  );
  return (
    <footer className={s.nav}>
      {navItems.map((item) =>
        item.fab ? (
          <button
            key="add"
            className={s.fab}
            onClick={() => setPage("add")}
            aria-label={t("footer.addLeak")}
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
                <span className={s.badge}>
                  {openCount > 99 ? "99+" : openCount}
                </span>
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
