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

function createSyncId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `sync-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
  );
}

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

function initProjectState() {
  const projects = initProjects();
  return {
    projects,
    activeId: initActiveId(projects),
  };
}

export function ProjectProvider({ children }) {
  const [initialState] = useState(initProjectState);
  const [projects, setProjectsState] = useState(initialState.projects);
  const [activeId, setActiveIdState] = useState(initialState.activeId);

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
    (name, type, options = {}) => {
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
        syncId:
          String(options.syncId ?? "")
            .trim()
            .toLowerCase() || createSyncId(),
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

  const setProjectSyncId = useCallback(
    (id, syncId) => {
      const normalized = String(syncId ?? "")
        .trim()
        .toLowerCase();
      if (!normalized) return null;

      const current = projectsRef.current;
      const project = current.find((item) => item.id === id);
      if (!project || (project.syncId && project.syncId !== normalized)) {
        return null;
      }
      if (project.syncId === normalized) return project;

      const updated = { ...project, syncId: normalized };
      const next = current.map((item) => (item.id === id ? updated : item));
      projectsRef.current = next;
      _setProjects(next);
      return updated;
    },
    [_setProjects],
  );

  const replaceProjectSyncId = useCallback(
    (id, syncId) => {
      const normalized = String(syncId ?? "")
        .trim()
        .toLowerCase();
      if (normalized.length < 8) return null;

      const current = projectsRef.current;
      const project = current.find((item) => item.id === id);
      if (!project) return null;
      if (project.syncId === normalized) return project;

      const updated = { ...project, syncId: normalized };
      const next = current.map((item) => (item.id === id ? updated : item));
      projectsRef.current = next;
      _setProjects(next);
      return updated;
    },
    [_setProjects],
  );

  const restoreProjectMetadata = useCallback(
    (id, metadata = {}) => {
      const current = projectsRef.current;
      const project = current.find((item) => item.id === id);
      if (!project) return null;

      const name = String(metadata.name ?? "").trim() || project.name;
      const type = PROJECT_META[metadata.type] ? metadata.type : project.type;
      const incomingSyncId = String(metadata.syncId ?? "")
        .trim()
        .toLowerCase();
      const syncId =
        incomingSyncId.length >= 8 ? incomingSyncId : project.syncId;
      const updated = {
        ...project,
        name,
        type,
        ...(syncId ? { syncId } : {}),
      };
      const next = current.map((item) => (item.id === id ? updated : item));

      projectsRef.current = next;
      _setProjects(next);
      return updated;
    },
    [_setProjects],
  );

  const ensureProjectSyncId = useCallback(
    (id) => {
      const project = projectsRef.current.find((item) => item.id === id);
      if (!project) return null;
      return project.syncId ? project : setProjectSyncId(id, createSyncId());
    },
    [setProjectSyncId],
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
      setProjectSyncId,
      replaceProjectSyncId,
      restoreProjectMetadata,
      ensureProjectSyncId,
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
      setProjectSyncId,
      replaceProjectSyncId,
      restoreProjectMetadata,
      ensureProjectSyncId,
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
