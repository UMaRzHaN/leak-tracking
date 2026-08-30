import {
  createContext,
  use,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { PROJECT_META } from "@/configs/projectMeta";
import {
  loadProjects,
  saveProjects,
  loadActiveId,
  saveActiveId,
  toFolderName,
  toUniqueFolderName,
} from "./projectStorage";
import { migrateFromLegacy } from "./projectMigration";
import { globalScope } from "@/utils/globalScope";

export { toFolderName };

// Split into two contexts so action-only consumers don't re-render on data change
// and data-only consumers don't re-render when stable action callbacks are recreated.
// Значение по умолчанию — `null`: провайдера может не быть, и хуки ниже это
// проверяют. Тип оставлен свободным намеренно: контекст собирается из десятка
// действий, и описывать их здесь значило бы вести второй список рядом с
// настоящим.
/** @type {import("react").Context<any>} */
const ProjectDataContext = createContext(null);
/** @type {import("react").Context<any>} */
const ProjectActionsContext = createContext(null);

function createSyncId() {
  return (
    globalScope.crypto?.randomUUID?.() ??
    `sync-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
  );
}

function createProjectId() {
  return (
    globalScope.crypto?.randomUUID?.() ??
    `project-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
  );
}

function withProjectType(project, type) {
  if (project.type === type) return project;
  const withoutLegacyMarker = { ...project };
  delete withoutLegacyMarker.legacyStorageType;
  return { ...withoutLegacyMarker, type };
}

function initProjects() {
  const list = loadProjects();
  const migrated = migrateFromLegacy(list);
  return migrated.length > 0 ? migrated : list;
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
  const initialStateRef = useRef(
    /** @type {ReturnType<typeof initProjectState>|null} */ (null),
  );
  if (initialStateRef.current === null)
    initialStateRef.current = initProjectState();
  const [projects, setProjects] = useState(initialStateRef.current.projects);
  const [activeId, setActiveId] = useState(initialStateRef.current.activeId);

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
    const result =
      typeof next === "function" ? next(projectsRef.current) : next;
    saveProjects(result);
    projectsRef.current = result;
    setProjects(result);
  }, []);

  const _setActiveId = useCallback((id) => {
    saveActiveId(id);
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const addProject = useCallback((name, type, options = {}) => {
    if (!type || !PROJECT_META[type]) return null;

    const current = projectsRef.current;
    const id = createProjectId();
    const existingFolders = new Set(current.map((p) => p.folderName));
    const uniqueFolder = toUniqueFolderName(
      name || PROJECT_META[type].title,
      existingFolders,
    );

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

    const nextProjects = [...current, newProject];
    const previousActiveId = activeIdRef.current;
    try {
      saveProjects(nextProjects);
      saveActiveId(id);
    } catch (error) {
      // Project metadata and active identity form one logical commit. Restore
      // both persisted values before exposing the failed project to callers.
      try {
        saveProjects(current);
        saveActiveId(previousActiveId);
      } catch {
        // Best effort: preserve the original error and keep React state intact.
      }
      throw error;
    }

    projectsRef.current = nextProjects;
    activeIdRef.current = id;
    setProjects(nextProjects);
    setActiveId(id);
    return newProject;
  }, []);

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

      const existingFolders = new Set(
        current.filter((p) => p.id !== id).map((p) => p.folderName),
      );
      const newFolderName = toUniqueFolderName(trimmed, existingFolders);

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
        prev.map((p) => (p.id === id ? withProjectType(p, type) : p)),
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
        ...withProjectType(project, type),
        name,
        ...(syncId ? { syncId } : {}),
      };
      const next = current.map((item) => (item.id === id ? updated : item));

      projectsRef.current = next;
      _setProjects(next);
      return updated;
    },
    [_setProjects],
  );

  const restoreProjectSnapshot = useCallback(
    (id, snapshot) => {
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot) ||
        snapshot.id !== id
      ) {
        return null;
      }

      const current = projectsRef.current;
      if (!current.some((item) => item.id === id)) return null;
      const restored = { ...snapshot };
      _setProjects(current.map((item) => (item.id === id ? restored : item)));
      return restored;
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

  const removeProject = useCallback((id) => {
    const current = projectsRef.current;
    const next = current.filter((p) => p.id !== id);
    if (next.length === current.length) return false;

    const previousActiveId = activeIdRef.current;
    const nextActiveId =
      previousActiveId === id ? (next[0]?.id ?? null) : previousActiveId;
    try {
      saveProjects(next);
      if (nextActiveId !== previousActiveId) saveActiveId(nextActiveId);
    } catch (error) {
      // localStorage has no transaction support. Restore the project list
      // before exposing any state change if the active-id write failed.
      try {
        saveProjects(current);
        saveActiveId(previousActiveId);
      } catch {
        // Best effort: the original project data is still untouched.
      }
      throw error;
    }

    projectsRef.current = next;
    setProjects(next);
    if (nextActiveId !== previousActiveId) {
      activeIdRef.current = nextActiveId;
      setActiveId(nextActiveId);
    }
    return true;
  }, []);

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
      restoreProjectSnapshot,
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
      restoreProjectSnapshot,
      ensureProjectSyncId,
      removeProject,
      changeProject,
      overwriteProject,
    ],
  );

  return (
    <ProjectDataContext value={dataValue}>
      <ProjectActionsContext value={actionsValue}>
        {children}
      </ProjectActionsContext>
    </ProjectDataContext>
  );
}

// Backward-compatible hook — merges both contexts, works everywhere useProject() was used.
export function useProject() {
  const data = use(ProjectDataContext);
  const actions = use(ProjectActionsContext);
  if (!data || !actions)
    throw new Error("useProject must be used within ProjectProvider");
  return { ...data, ...actions };
}

// Granular hooks for components that only need one slice.
export function useProjectData() {
  const data = use(ProjectDataContext);
  if (!data)
    throw new Error("useProjectData must be used within ProjectProvider");
  return data;
}

export function useProjectActions() {
  const actions = use(ProjectActionsContext);
  if (!actions)
    throw new Error("useProjectActions must be used within ProjectProvider");
  return actions;
}
