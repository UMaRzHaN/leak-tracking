import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { PROJECT_META } from "@/configs/projects";
import {
  toFolderName,
  loadProjects,
  saveProjects,
  loadActiveId,
  saveActiveId,
} from "./projectStorage";
import { migrateFromLegacy } from "./projectMigration";

export { toFolderName };

// Split into two contexts so action-only consumers don't re-render on data change
// and data-only consumers don't re-render when stable action callbacks are recreated.
const ProjectDataContext = createContext(null);
const ProjectActionsContext = createContext(null);

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

  // Refs let action callbacks read current state without closing over it.
  // This makes every action permanently stable (never recreated after mount),
  // so ProjectActionsContext value never changes and its consumers never
  // re-render due to project data changes.
  const projectsRef = useRef(projects);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

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

      const current = projectsRef.current;
      const id = String(Date.now());
      const folder = toFolderName(name || PROJECT_META[type].title);
      const existingFolders = new Set(current.map((p) => p.folderName));
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

      _setProjects([...current, newProject]);
      _setActiveId(id);
      return newProject;
    },
    [_setProjects, _setActiveId],
  );

  const configure = useCallback(
    (type, name) => addProject(name, type),
    [addProject],
  );

  const selectProject = useCallback(
    (id) => {
      if (!projectsRef.current.some((p) => p.id === id)) return;
      _setActiveId(id);
    },
    [_setActiveId],
  );

  const renameProject = useCallback(
    (id, name) => {
      const trimmed = name?.trim();
      if (!trimmed) return null;

      const current = projectsRef.current;
      const found = current.find((p) => p.id === id);
      if (!found) return null;

      const folder = toFolderName(trimmed);
      const existingFolders = new Set(
        current.filter((p) => p.id !== id).map((p) => p.folderName),
      );
      let newFolderName = folder;
      let suffix = 2;
      while (existingFolders.has(newFolderName)) {
        newFolderName = `${folder}_${suffix++}`;
      }

      _setProjects(
        current.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      );
      return { oldFolderName: found.folderName, newFolderName };
    },
    [_setProjects],
  );

  const applyFolderRename = useCallback(
    (id, newFolderName) => {
      _setProjects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, folderName: newFolderName } : p,
        ),
      );
    },
    [_setProjects],
  );

  const changeProjectType = useCallback(
    (id, type) => {
      if (!PROJECT_META[type]) return;
      _setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, type } : p)),
      );
    },
    [_setProjects],
  );

  const removeProject = useCallback(
    (id) => {
      const current = projectsRef.current;
      const next = current.filter((p) => p.id !== id);
      _setProjects(next);
      if (activeIdRef.current === id) _setActiveId(next[0]?.id ?? null);
    },
    [_setProjects, _setActiveId],
  );

  const changeProject = useCallback(
    (type) => {
      const id = activeIdRef.current;
      if (id) changeProjectType(id, type);
    },
    [changeProjectType],
  );

  // Switches the active project to `id`. Does NOT write leak data —
  // callers must use saveRef.current() to update both storage and React state.
  const overwriteProject = useCallback(
    (id) => {
      if (!projectsRef.current.some((p) => p.id === id)) return false;
      _setActiveId(id);
      return true;
    },
    [_setActiveId],
  );

  const dataValue = useMemo(
    () => ({
      projects,
      activeProject,
      activeId,
      project,
      projectName,
      isConfigured,
    }),
    [projects, activeProject, activeId, project, projectName, isConfigured],
  );

  const actionsValue = useMemo(
    () => ({
      addProject,
      configure,
      selectProject,
      renameProject,
      applyFolderRename,
      changeProjectType,
      removeProject,
      changeProject,
      overwriteProject,
    }),
    [
      addProject,
      configure,
      selectProject,
      renameProject,
      applyFolderRename,
      changeProjectType,
      removeProject,
      changeProject,
      overwriteProject,
    ],
  );

  return (
    <ProjectDataContext.Provider value={dataValue}>
      <ProjectActionsContext.Provider value={actionsValue}>
        {children}
      </ProjectActionsContext.Provider>
    </ProjectDataContext.Provider>
  );
}

// Backward-compatible hook — merges both contexts, works everywhere useProject() was used.
export function useProject() {
  const data = useContext(ProjectDataContext);
  const actions = useContext(ProjectActionsContext);
  if (!data || !actions)
    throw new Error("useProject must be used within ProjectProvider");
  return { ...data, ...actions };
}

// Granular hooks for components that only need one slice.
export function useProjectData() {
  const data = useContext(ProjectDataContext);
  if (!data)
    throw new Error("useProjectData must be used within ProjectProvider");
  return data;
}

export function useProjectActions() {
  const actions = useContext(ProjectActionsContext);
  if (!actions)
    throw new Error("useProjectActions must be used within ProjectProvider");
  return actions;
}
