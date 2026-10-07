import { formatLocationScopeLabel } from "@/utils/locationScopeLabel";
import { useMemo } from "react";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_META } from "@/configs/projectMeta";
import { useLanguage } from "@/app/hooks/useLanguage";
import Icon from "@/components/ui/Icon/Icon";
import s from "./Header.module.scss";

/**
 * Светлая шапка редизайна (экран 2b). Профиль и настройки отсюда ушли в
 * бургер-меню (3a): в шапке остаётся только то, что меняется за смену, — GPS и
 * выбранное место.
 */
export default function Header({
  setPage,
  geoError,
  coords,
  geoLoading,
  gpsEnabled,
  setGpsEnabled,
  onMenuOpen,
  // Форму задаёт `useActiveLocation`, а не эта шапка: здесь достаточно знать,
  // что области может не быть вовсе.
  locationScope = /** @type {any} */ (null),
  onLocationScopeOpen,
}) {
  const { projectName, project } = useProjectData();
  const meta = PROJECT_META[project];
  const { t } = useLanguage();
  const localeTexts = useMemo(
    () => ({
      defaultProject: t("header.defaultProject"),
      menu: t("header.menu"),

      gpsOnTitle: t("header.gpsOnTitle"),
      gpsOffTitle: t("header.gpsOffTitle"),

      gpsOn: t("header.gpsOn"),
      gpsOff: t("header.gpsOff"),
      gpsSearch: t("header.gpsSearch"),
      gpsError: t("header.gpsError"),
    }),
    [t],
  );
  const displayName = projectName || meta?.title || localeTexts.defaultProject;
  const hasCoords =
    gpsEnabled && Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng);
  const gpsState = geoLoading
    ? "search"
    : geoError
      ? "error"
      : gpsEnabled && hasCoords
        ? "on"
        : "off";
  const gpsStatus = {
    search: localeTexts.gpsSearch,
    error: localeTexts.gpsError,
    on: localeTexts.gpsOn,
    off: localeTexts.gpsOff,
  }[gpsState];
  const gpsTitle = gpsEnabled
    ? localeTexts.gpsOnTitle
    : localeTexts.gpsOffTitle;
  const scoped =
    locationScope?.path === null || locationScope?.path?.length > 0;

  return (
    <header className={s.header}>
      <div className={s.topRow}>
        <button
          className={s.menuBtn}
          type="button"
          onClick={onMenuOpen}
          title={localeTexts.menu}
          aria-label={localeTexts.menu}
        >
          <Icon name="menu" size={20} />
        </button>

        <button
          className={s.nameArea}
          type="button"
          onClick={() => setPage("")}
          title={displayName}
        >
          {meta && <span className={s.typeLabel}>{meta.title}</span>}
          <span className={s.projectName}>{displayName}</span>
        </button>

        {/* Координаты из шапки ушли — в строке на 375 пикселях они вытесняли
            название проекта. Теперь их видно в подсказке кнопки, а статус
            остаётся цветом и точкой. */}
        <button
          className={`${s.gpsBtn} ${s[`gps_${gpsState}`]}`}
          type="button"
          onClick={() => setGpsEnabled?.((value) => !value)}
          title={
            hasCoords
              ? `${gpsTitle} · ${coords.lat.toFixed(6)} / ${coords.lng.toFixed(6)}`
              : gpsTitle
          }
          aria-label={gpsTitle}
          aria-pressed={Boolean(gpsEnabled)}
        >
          <Icon name="pin" size={14} />
          <span className={s.gpsLabel}>{gpsStatus}</span>
          <span className={s.gpsDot} aria-hidden="true" />
        </button>
      </div>

      {locationScope?.available && (
        <div className={s.scopeRow}>
          <button
            className={`${s.scopeBtn} ${scoped ? s.scopeBtnActive : ""}`}
            type="button"
            onClick={onLocationScopeOpen}
            title={t("locationScope.title")}
          >
            <span className={s.scopeIcon}>
              <Icon name="folder" size={17} strokeWidth={1.7} />
            </span>
            <span className={s.scopePath}>
              {formatLocationScopeLabel(locationScope, t)}
            </span>
            {scoped && locationScope.scopedCount !== null && (
              <span className={s.scopeCount}>{locationScope.scopedCount}</span>
            )}
            <span className={s.scopeChevron}>
              <Icon name="chevronRight" size={14} strokeWidth={2} />
            </span>
          </button>

          {scoped && (
            <button
              className={s.scopeReset}
              type="button"
              onClick={() => locationScope.setPath([])}
              title={t("locationScope.reset")}
              aria-label={t("locationScope.reset")}
            >
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </header>
  );
}
