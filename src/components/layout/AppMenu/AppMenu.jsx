import { useId } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import { MODULE } from "@/app/modules/activeModule";
import s from "./AppMenu.module.scss";

/**
 * Бургер-меню главного экрана (макет 3a). Сюда из шапки и нижней панели
 * переехало всё, что нужно не на каждом шагу обхода: профиль, проект,
 * настройки, модули, обмен данными.
 *
 * Пункт модуля (LDAR, мониторинг) переключает модуль — вместе с ним меняется
 * нижняя панель. Экспорт, импорт и синхронизация пока ведут в разделы
 * настроек, а не на свои экраны.
 */
export default function AppMenu({
  open,
  onClose,
  setPage,
  module = /** @type {string} */ (MODULE.LDAR),
  onSelectModule,
  onOpenSettings,
  onEditProfile,
  userProfile,
  projectName,
  openCount = 0,
  repairCount = 0,
  showRegistry = false,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ open, onClose });

  if (!open) return null;

  const userName = userProfile?.name?.trim() ?? "";
  const go = (action) => {
    onClose?.();
    action();
  };

  const modules = [
    {
      key: "leaks",
      icon: "drop",
      label: t("appMenu.leaks"),
      meta: openCount > 0 ? t("appMenu.openCount", { count: openCount }) : "",
      metaTone: "danger",
      active: module === MODULE.LDAR,
      onClick: () => onSelectModule(MODULE.LDAR),
    },
    {
      key: "repairs",
      icon: "wrench",
      label: t("appMenu.repairs"),
      meta:
        repairCount > 0 ? t("repairs.menuMeta", { count: repairCount }) : "",
      metaTone: "warning",
      active: module === MODULE.REPAIRS,
      onClick: () => onSelectModule(MODULE.REPAIRS),
    },
    {
      key: "monitoring",
      icon: "chart",
      label: t("appMenu.monitoring"),
      active: module === MODULE.MONITORING,
      onClick: () => onSelectModule(MODULE.MONITORING),
    },
    ...(showRegistry
      ? [
          {
            key: "components",
            icon: "clipboard",
            label: t("appMenu.inventory"),
            active: module === MODULE.INVENTORY,
            onClick: () => onSelectModule(MODULE.INVENTORY),
          },
        ]
      : []),
  ];

  const tools = [
    {
      key: "export",
      icon: "download",
      label: t("appMenu.export"),
      onClick: () => setPage("export"),
    },
    {
      key: "import",
      icon: "upload",
      label: t("appMenu.import"),
      onClick: () => onOpenSettings("backup"),
    },
    {
      key: "sync",
      icon: "sync",
      label: t("appMenu.sync"),
      onClick: () => onOpenSettings("sync"),
    },
  ];

  const renderItem = (item) => (
    <button
      key={item.key}
      type="button"
      className={`${s.item} ${item.active ? s.itemActive : ""}`}
      aria-current={item.active ? "page" : undefined}
      onClick={() => go(item.onClick)}
    >
      <span className={s.itemIcon}>
        <Icon name={item.icon} size={21} strokeWidth={1.7} />
      </span>
      <span className={s.itemLabel}>{item.label}</span>
      {item.meta && (
        <span
          className={`${s.itemMeta} ${item.metaTone ? s[`meta_${item.metaTone}`] : ""}`}
        >
          {item.meta}
        </span>
      )}
    </button>
  );

  return (
    <div className={s.root}>
      <div className={s.backdrop} data-modal-backdrop="" onClick={onClose} />
      <nav
        ref={dialogRef}
        className={s.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={s.head}>
          <div className={s.user}>
            <span className={s.avatar} aria-hidden="true">
              {userName.slice(0, 1).toUpperCase() || (
                <Icon name="edit" size={18} />
              )}
            </span>
            {/* Роли («Оператор обхода» в макете) профиль не хранит — только
                имя, поэтому подписи под ним нет. */}
            <span id={titleId} className={s.userName}>
              {userName || t("appMenu.noName")}
            </span>
            <button
              type="button"
              className={s.close}
              onClick={onClose}
              aria-label={t("appMenu.close")}
            >
              <Icon name="close" size={19} strokeWidth={2} />
            </button>
          </div>

          <button
            type="button"
            className={s.project}
            onClick={() => go(() => onOpenSettings("projects"))}
            title={t("appMenu.switchProject")}
          >
            <span className={s.projectText}>
              <span className={s.caption}>{t("appMenu.project")}</span>
              <span className={s.projectName}>{projectName}</span>
            </span>
            <span className={s.projectIcon}>
              <Icon name="swap" size={16} strokeWidth={1.8} />
            </span>
          </button>
        </div>

        <div className={s.list}>
          {renderItem({
            key: "profile",
            icon: "edit",
            label: t("appMenu.editName"),
            meta: userName,
            onClick: onEditProfile,
          })}
          {renderItem({
            key: "settings",
            icon: "settings",
            label: t("appMenu.settings"),
            onClick: () => onOpenSettings(null),
          })}
          {modules.map(renderItem)}
          <div className={s.divider} role="separator" />
          {tools.map(renderItem)}
        </div>
      </nav>
    </div>
  );
}
