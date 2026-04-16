import { useProject } from "../../app/settings/ProjectContext";
import { PROJECT_META } from "../../configs/projects";
import { formatAccuracy } from "../../utils/geoUtils";
import s from "./Header.module.scss";

export default function Header({
  setPage,
  geoError,
  coords,
  geoLoading,
  gpsEnabled,
  setGpsEnabled,
}) {
  const { projectName, project } = useProject();
  const meta        = PROJECT_META[project];
  const displayName = projectName || meta?.title || "Журнал утечек";
  const acc         = formatAccuracy(coords?.accuracy);

  return (
    <header className={s.header}>
      {/* ── Left: project info ── */}
      <button className={s.nameArea} onClick={() => setPage("")}>
        <span className={s.appLabel}>Журнал утечек газа</span>
        <span className={s.projectName}>{displayName}</span>
        {meta && <span className={s.typeBadge}>{meta.title}</span>}
      </button>

      {/* ── Right: GPS + settings ── */}
      <div className={s.right}>
        {/* GPS toggle */}
        <button
          className={`${s.gpsToggle} ${gpsEnabled ? s.gpsOn : s.gpsOff}`}
          onClick={() => setGpsEnabled?.((v) => !v)}
          title={gpsEnabled ? "GPS включён — нажмите для паузы" : "GPS выключен — нажмите для включения"}
        >
          {gpsEnabled ? (
            <>
              <div className={s.gpsRow}>
                <span className={s.gpsDot} />
                {geoLoading ? (
                  <span className={s.gpsLabel}>GPS…</span>
                ) : geoError ? (
                  <span className={s.gpsLabel}>Ошибка</span>
                ) : coords?.lat ? (
                  <span className={s.gpsLabel}>GPS вкл</span>
                ) : (
                  <span className={s.gpsLabel}>Поиск…</span>
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
              <span className={s.gpsLabel}>GPS выкл</span>
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
          title="Настройки"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
