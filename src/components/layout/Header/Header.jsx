import { useMemo } from "react";
import { useProjectData } from "@/app/project/ProjectContext";
import { PROJECT_META } from "@/configs/projects";
import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./Header.module.scss";

export default function Header({
  setPage,
  geoError,
  coords,
  geoLoading,
  gpsEnabled,
  setGpsEnabled,
  userProfile,
  onUserProfileOpen,
}) {
  const { projectName, project } = useProjectData();
  const meta = PROJECT_META[project];
  const { t, lang } = useLanguage();
  const localeTexts = useMemo(
    () => ({
      appTitle: t("header.appTitle"),
      defaultProject: t("header.defaultProject"),

      gpsOnTitle: t("header.gpsOnTitle"),
      gpsOffTitle: t("header.gpsOffTitle"),

      gps: t("header.gps"),
      gpsOn: t("header.gpsOn"),
      gpsOff: t("header.gpsOff"),
      gpsSearch: t("header.gpsSearch"),
      gpsError: t("header.gpsError"),

      settings: t("header.settings"),
    }),
    [t],
  );
  const displayName = projectName || meta?.title || localeTexts.defaultProject;
  const userName = userProfile?.name?.trim() ?? "";
  const userInitial = userName.slice(0, 1).toUpperCase();

  return (
    <header className={s.header}>
      {/* ── Left: project info ── */}
      <button className={s.nameArea} onClick={() => setPage("")}>
        <span className={s.appLabel}>{localeTexts.appTitle}</span>
        <span className={s.projectName}>{displayName}</span>
        {meta && <span className={s.typeBadge}>{meta.title}</span>}
      </button>

      {/* ── Right: GPS + settings ── */}
      <div className={s.right}>
        <button
          className={`${s.userBtn} ${userName ? s.userBtnActive : ""}`}
          type="button"
          onClick={onUserProfileOpen}
          title={userName || (lang === "ru" ? "Пользователь" : "User")}
        >
          {userInitial || <span className={s.userIcon} aria-hidden="true" />}
        </button>

        {/* GPS toggle */}
        <button
          className={`${s.gpsToggle} ${gpsEnabled ? s.gpsOn : s.gpsOff}`}
          onClick={() => setGpsEnabled?.((v) => !v)}
          title={gpsEnabled ? localeTexts.gpsOnTitle : localeTexts.gpsOffTitle}
        >
          {gpsEnabled ? (
            <>
              <div className={s.gpsRow}>
                <span className={s.gpsDot} />
                {geoLoading ? (
                  <span className={s.gpsLabel}>{localeTexts.gpsSearch}</span>
                ) : geoError ? (
                  <span className={s.gpsLabel}>{localeTexts.gpsError}</span>
                ) : coords?.lat ? (
                  <span className={s.gpsLabel}>{localeTexts.gpsOn}</span>
                ) : (
                  <span className={s.gpsLabel}>{localeTexts.gpsOff}</span>
                )}
              </div>
              {coords?.lat != null && (
                <div className={s.gpsCoords}>
                  {coords.lat.toFixed(6)}&nbsp;/&nbsp;{coords.lng.toFixed(6)}
                </div>
              )}
            </>
          ) : (
            <>
              <span className={s.gpsLabel}>{localeTexts.gpsOff}</span>
              {coords?.lat != null && (
                <div className={s.gpsCoords}>
                  {coords.lat.toFixed(6)}&nbsp;/&nbsp;{coords.lng.toFixed(6)}
                </div>
              )}
            </>
          )}
        </button>

        {/* Settings */}
        <button
          className={s.settingsBtn}
          onClick={() => setPage("settings")}
          title={localeTexts.settings}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
