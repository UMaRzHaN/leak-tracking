import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "../../configs/projects";

const DEFAULT_PROJECT = "midstream";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
    return PROJECT_META[saved] ? saved : DEFAULT_PROJECT;
  });

  const changeProject = useCallback((id) => {
    if (!id || !PROJECT_META[id]) {
      console.warn(`[Project] Unknown project id: ${id}`);
      return;
    }

    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, id);
    setProject(id);

    if (process.env.NODE_ENV === "development") {
      console.log(`✨ Проект изменён на: ${id}`);
    }
  }, []);

  const value = useMemo(
    () => ({ project, changeProject }),
    [project, changeProject],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}
