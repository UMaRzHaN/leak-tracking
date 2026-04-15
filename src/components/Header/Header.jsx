import { useProject } from "../../app/settings/ProjectContext";
import { PROJECT_META } from "../../configs/projects";
import s from "./Header.module.scss";

export default function Header({ setPage, geoError, coords, geoLoading }) {
  const { projectName, project } = useProject();
  const meta = PROJECT_META[project];

  const displayName = projectName || meta?.title || "Журнал утечек";

  return (
    <header className={s.header} onClick={() => setPage("")}>
      <div className={s.appName}>Журнал утечек газа</div>

      <div className={s.projectRow}>
        <span className={s.projectName}>{displayName}</span>
        {meta && <span className={s.projectType}>{meta.title}</span>}
      </div>

      <div className={s.coords}>
        {geoError ? (
          <span>📍 {geoError}</span>
        ) : geoLoading ? (
          <span>📍 Определение…</span>
        ) : coords?.lat && coords?.lng ? (
          <span>📍 {coords.lat.toFixed(6)} / {coords.lng.toFixed(6)}</span>
        ) : (
          <span>📍 Нет данных</span>
        )}
      </div>
    </header>
  );
}
