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
  const hasCoords =
    Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng);
  const gpsStatus = geoLoading
    ? localeTexts.gpsSearch
    : geoError
      ? localeTexts.gpsError
      : gpsEnabled && hasCoords
        ? localeTexts.gpsOn
        : localeTexts.gpsOff;

  return (
    <header className={s.header}>
      <div className={s.topRow}>
        <button
          className={s.nameArea}
          type="button"
          onClick={() => setPage("")}
          title={displayName}
        >
          <span className={s.appLabel}>{localeTexts.appTitle}</span>
          <span className={s.projectName}>{displayName}</span>
        </button>

        <div className={s.actions}>
          <button
            className={`${s.userBtn} ${userName ? s.userBtnActive : ""}`}
            type="button"
            onClick={onUserProfileOpen}
            title={userName || (lang === "ru" ? "Пользователь" : "User")}
            aria-label={userName || (lang === "ru" ? "Пользователь" : "User")}
          >
            {userInitial || <span className={s.userIcon} aria-hidden="true" />}
          </button>

          <button
            className={s.settingsBtn}
            type="button"
            onClick={() => setPage("settings")}
            title={localeTexts.settings}
            aria-label={localeTexts.settings}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </div>

      <div className={s.statusRow}>
        {meta && <span className={s.typeBadge}>{meta.title}</span>}

        <button
          className={`${s.gpsToggle} ${gpsEnabled ? s.gpsOn : s.gpsOff}`}
          type="button"
          onClick={() => setGpsEnabled?.((value) => !value)}
          title={gpsEnabled ? localeTexts.gpsOnTitle : localeTexts.gpsOffTitle}
          aria-label={
            gpsEnabled ? localeTexts.gpsOnTitle : localeTexts.gpsOffTitle
          }
        >
          <span className={s.gpsSummary}>
            <span className={s.gpsDot} aria-hidden="true" />
            <span className={s.gpsLabel}>{gpsStatus}</span>
          </span>
          {hasCoords && (
            <span className={s.gpsCoords}>
              {coords.lat.toFixed(6)} / {coords.lng.toFixed(6)}
            </span>
          )}
          <span className={s.gpsSwitch} aria-hidden="true">
            <span className={s.gpsSwitchThumb} />
          </span>
        </button>
      </div>
    </header>
  );
}
