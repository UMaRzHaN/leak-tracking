import { useMemo } from "react";
import s from "./Footer.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";
import Icon from "@/components/ui/Icon/Icon";

/**
 * Нижняя панель модуля утечек (2b). Реестр компонентов отсюда ушёл в
 * бургер-меню как «Инвентаризация»: у него будет своя панель, а держать
 * чужой модуль вкладкой значило бы шесть кнопок на 375 пикселях.
 */
export default function Footer({ page, setPage, openCount = 0 }) {
  const { t } = useLanguage();
  const navItems = useMemo(
    () => [
      { key: "", icon: "home", label: t("footer.home") },
      { key: "db", icon: "database", label: t("footer.database"), badge: true },
      { key: "add", fab: true },
      { key: "monitoring", icon: "chart", label: t("footer.monitoring") },
      { key: "map", icon: "map", label: t("footer.map") },
    ],
    [t],
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
            <Icon name="plus" size={26} strokeWidth={2.2} />
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
              <Icon name={item.icon} />
              {item.badge && openCount > 0 && (
                <span className={s.badge}>
                  {openCount > 99 ? "99+" : openCount}
                </span>
              )}
            </span>
            <span className={s.label}>{item.label}</span>
          </button>
        ),
      )}
    </footer>
  );
}
