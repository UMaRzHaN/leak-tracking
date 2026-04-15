import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "../../configs/projects";

const ProjectContext = createContext(null);

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECT_CONFIG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.type || !PROJECT_META[parsed.type]) return null;
    return parsed; // { type, name, configuredAt }
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }) {
  const [config, setConfig] = useState(() => loadConfig());

  /* type — upstream/midstream/downstream */
  const project = config?.type ?? null;
  /* user-provided name, e.g. "Месторождение Тенгиз" */
  const projectName = config?.name ?? "";
  const isConfigured = config !== null;

  const configure = useCallback((type, name) => {
    if (!type || !PROJECT_META[type]) {
      console.warn(`[Project] Unknown project type: ${type}`);
      return;
    }
    const next = { type, name: name?.trim() || PROJECT_META[type].title, configuredAt: Date.now() };
    localStorage.setItem(STORAGE_KEYS.PROJECT_CONFIG, JSON.stringify(next));
    setConfig(next);
  }, []);

  const changeProject = useCallback(
    (type) => {
      if (!type || !PROJECT_META[type]) {
        console.warn(`[Project] Unknown project type: ${type}`);
        return;
      }
      const next = { ...config, type, configuredAt: Date.now() };
      localStorage.setItem(STORAGE_KEYS.PROJECT_CONFIG, JSON.stringify(next));
      setConfig(next);
    },
    [config],
  );

  const renameProject = useCallback(
    (name) => {
      if (!config) return;
      const next = { ...config, name: name?.trim() || config.name };
      localStorage.setItem(STORAGE_KEYS.PROJECT_CONFIG, JSON.stringify(next));
      setConfig(next);
    },
    [config],
  );

  const value = useMemo(
    () => ({ project, projectName, isConfigured, configure, changeProject, renameProject }),
    [project, projectName, isConfigured, configure, changeProject, renameProject],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}
