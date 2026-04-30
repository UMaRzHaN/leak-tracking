import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { PROJECT_META } from "../../configs/projects";
import {
  toFolderName,
  loadProjects,
  saveProjects,
  loadActiveId,
  saveActiveId,
} from "./projectStorage";
import { migrateFromLegacy } from "./projectMigration";

export { toFolderName };

const ProjectContext = createContext(null);

function initProjects() {
  const list = loadProjects();
  const migrated = migrateFromLegacy(list);
  return migrated.length > 0 && list.length === 0 ? migrated : list;
}

function initActiveId(projects) {
  const id = loadActiveId();
  if (id && projects.some((p) => p.id === id)) return id;
  return projects[0]?.id ?? null;
}

export function ProjectProvider({ children }) {
  const [projects, setProjectsState] = useState(initProjects);

  const [activeId, setActiveIdState] = useState(() =>
    initActiveId(initProjects()),
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  const project = activeProject?.type ?? null;
  const projectName = activeProject?.name ?? "";
  const isConfigured = activeProject !== null;

  const _setProjects = useCallback((next) => {
    if (typeof next === "function") {
      setProjectsState((prev) => {
        const result = next(prev);
        saveProjects(result);
        return result;
      });
    } else {
      saveProjects(next);
      setProjectsState(next);
    }
  }, []);

  const _setActiveId = useCallback((id) => {
    saveActiveId(id);
    setActiveIdState(id);
  }, []);

  const addProject = useCallback(
    (name, type) => {
      if (!type || !PROJECT_META[type]) return null;

      const id = String(Date.now());
      const folder = toFolderName(name || PROJECT_META[type].title);
      const existingFolders = new Set(projects.map((p) => p.folderName));
      let uniqueFolder = folder;
      let suffix = 2;
      while (existingFolders.has(uniqueFolder)) {
        uniqueFolder = `${folder}_${suffix++}`;
      }

      const newProject = {
        id,
        name: name?.trim() || PROJECT_META[type].title,
        type,
        folderName: uniqueFolder,
        createdAt: Date.now(),
      };

      _setProjects([...projects, newProject]);
      _setActiveId(id);
      return newProject;
    },
    [projects, _setProjects, _setActiveId],
  );

  const configure = useCallback((type, name) => addProject(name, type), [addProject]);

  const selectProject = useCallback(
    (id) => {
      if (!projects.some((p) => p.id === id)) return;
      _setActiveId(id);
    },
    [projects, _setActiveId],
  );

  const renameProject = useCallback(
    (id, name) => {
      const trimmed = name?.trim();
      if (!trimmed) return null;

      const found = projects.find((p) => p.id === id);
      if (!found) return null;

      const folder = toFolderName(trimmed);
      const existingFolders = new Set(
        projects.filter((p) => p.id !== id).map((p) => p.folderName),
      );
      let newFolderName = folder;
      let suffix = 2;
      while (existingFolders.has(newFolderName)) {
        newFolderName = `${folder}_${suffix++}`;
      }

      _setProjects(projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
      return { oldFolderName: found.folderName, newFolderName };
    },
    [projects, _setProjects],
  );

  const applyFolderRename = useCallback(
    (id, newFolderName) => {
      _setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, folderName: newFolderName } : p)),
      );
    },
    [_setProjects],
  );

  const changeProjectType = useCallback(
    (id, type) => {
      if (!PROJECT_META[type]) return;
      _setProjects(projects.map((p) => (p.id === id ? { ...p, type } : p)));
    },
    [projects, _setProjects],
  );

  const removeProject = useCallback(
    (id) => {
      const next = projects.filter((p) => p.id !== id);
      _setProjects(next);
      if (activeId === id) _setActiveId(next[0]?.id ?? null);
    },
    [projects, activeId, _setProjects, _setActiveId],
  );

  const changeProject = useCallback(
    (type) => {
      if (activeId) changeProjectType(activeId, type);
    },
    [activeId, changeProjectType],
  );

  const value = useMemo(
    () => ({
      projects,
      activeProject,
      activeId,
      project,
      projectName,
      isConfigured,
      addProject,
      configure,
      selectProject,
      renameProject,
      applyFolderRename,
      changeProjectType,
      removeProject,
      changeProject,
    }),
    [
      projects, activeProject, activeId, project, projectName, isConfigured,
      addProject, configure, selectProject, renameProject, applyFolderRename,
      changeProjectType, removeProject, changeProject,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}
