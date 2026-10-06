import { useMemo } from "react";
import s from "./Footer.module.scss";
import { useLanguage } from "@/app/hooks/useLanguage";
import { MODULE } from "@/app/modules/activeModule";
import Icon from "@/components/ui/Icon/Icon";

/**
 * Нижняя панель активного модуля. В LDAR (2b) в центре «+» — новые утечки
 * заводятся только здесь. В мониторинге (5a) в центре маршрут обхода, а
 * вкладка «Обход» ведёт в текущий обход. Реестр — отдельный модуль, его вход
 * в бургер-меню.
 */
export default function Footer({
  page,
  setPage,
  openCount = 0,
  module = /** @type {string} */ (MODULE.LDAR),
  onRoute = /** @type {(() => void)|null} */ (null),
  onAddComponent = /** @type {(() => void)|null} */ (null),
}) {
  const { t } = useLanguage();
  const navItems = useMemo(() => {
    const database = {
      key: "db",
      icon: "database",
      label: t("footer.database"),
      badge: true,
    };
    const map = { key: "map", icon: "map", label: t("footer.map") };
    if (module === MODULE.INVENTORY) {
      // Каркас 5a, но единица записи — компонент реестра (6a): «+» заводит
      // карточку, «Сверка» — аналог обхода.
      return [
        { key: "components", icon: "list", label: t("footer.registry") },
        database,
        ...(onAddComponent ? [{ key: "component-add", fab: true }] : []),
        { key: "reconcile", icon: "check", label: t("footer.reconcile") },
        map,
      ];
    }
    if (module === MODULE.REPAIRS) {
      return [
        { key: "", icon: "list", label: t("footer.records") },
        database,
        { key: "acceptance", fab: true },
        { key: "repair-round", icon: "pulse", label: t("footer.round") },
        map,
      ];
    }
    if (module === MODULE.MONITORING) {
      return [
        { key: "", icon: "list", label: t("footer.records") },
        database,
        ...(onRoute ? [{ key: "route", fab: true }] : []),
        { key: "monitoring", icon: "pulse", label: t("footer.round") },
        map,
      ];
    }
    return [
      { key: "", icon: "home", label: t("footer.home") },
      database,
      { key: "add", fab: true },
      { key: "coverage", icon: "pulse", label: t("footer.coverage") },
      map,
    ];
  }, [t, module, onRoute, onAddComponent]);

  return (
    <footer className={s.nav}>
      {navItems.map((item) =>
        item.fab ? (
          item.key === "component-add" ? (
            <button
              key="component-add"
              type="button"
              className={s.fab}
              onClick={onAddComponent}
              aria-label={t("components.add")}
            >
              <Icon name="plus" size={26} strokeWidth={2.2} />
            </button>
          ) : item.key === "acceptance" ? (
            <button
              key="acceptance"
              type="button"
              className={s.fab}
              onClick={() => setPage("acceptance")}
              aria-label={t("footer.acceptance")}
            >
              <Icon name="document" size={26} strokeWidth={2} />
            </button>
          ) : item.key === "add" ? (
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
              key="route"
              type="button"
              className={s.fab}
              onClick={onRoute}
              aria-label={t("footer.route")}
            >
              <Icon name="route" size={26} strokeWidth={2} />
            </button>
          )
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
