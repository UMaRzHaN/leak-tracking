import { useMemo } from "react";
import s from "./Footer.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";

export default function Footer({ page, setPage, openCount = 0, project }) {
  const { t } = useLanguage();
  // Derived from the project config, never from a comparison against the
  // project type: a stream that declares no registry simply has no tab.
  const showRegistry = hasComponentRegistry(project);
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
        key: "monitoring",
        icon: "M",
        label: t("footer.monitoring"),
      },
      ...(showRegistry
        ? [
            {
              key: "components",
              icon: "⚙",
              label: t("footer.components"),
            },
          ]
        : []),
      {
        key: "map",
        icon: "◎",
        label: t("footer.map"),
      },
    ],
    [t, showRegistry],
  );
  return (
    <footer className={s.nav}>
      {navItems.map((item) =>
        item.fab ? (
          <button
            key="add"
            type="button"
            className={s.fab}
            onClick={() => setPage("add")}
            aria-label={t("footer.addLeak")}
          >
            <span className={s.fabIcon}>+</span>
          </button>
        ) : (
          <button
            key={item.key || "home"}
            type="button"
            className={`${s.item} ${page === item.key ? s.active : ""}`}
            onClick={() => setPage(item.key)}
            aria-current={page === item.key ? "page" : undefined}
            aria-label={item.label}
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
