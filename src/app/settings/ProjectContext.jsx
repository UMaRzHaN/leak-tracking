import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { STORAGE_KEYS } from "./storageKeys";
import { PROJECT_META } from "../../configs/projects";

/* =====================================================
   TYPES
   project: {
     id: string,          // unique ID (timestamp)
     name: string,        // user display name
     type: string,        // "upstream" | "midstream" | "downstream"
     folderName: string,  // safe for filesystem — set once, never changes
     createdAt: number,
   }
===================================================== */

const ProjectContext = createContext(null);

/* =====================================================
   HELPERS
===================================================== */

/** Создаёт безопасное имя папки из произвольного названия */
export function toFolderName(name) {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*\0]/g, "") // убираем символы, запрещённые в именах файлов
      .replace(/\s+/g, "_")
      .slice(0, 50) || "project"
  );
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveProjects(list) {
  localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify(list));
}

function loadActiveId() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID) ?? null;
}

function saveActiveId(id) {
  if (id == null) {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
  } else {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, id);
  }
}

const MIGRATION_DONE_KEY = "app:legacy_migrated_v1";

/** Миграция из старого одиночного формата → список проектов.
 *  Запускается только один раз: после успешной миграции удаляет legacy-ключ
 *  и выставляет флаг, чтобы не воскрешать проект при следующей пустой инициализации. */
function migrateFromLegacy(existingList) {
  if (existingList.length > 0) return existingList; // уже есть проекты

  // Если миграция уже была выполнена — не трогать
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);
    if (!raw) {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      return [];
    }
    const old = JSON.parse(raw); // { type, name, configuredAt }
    if (!old?.type || !PROJECT_META[old.type]) {
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      return [];
    }

    const migrated = {
      id: String(old.configuredAt ?? Date.now()),
      name: old.name || PROJECT_META[old.type].title,
      type: old.type,
      folderName: toFolderName(old.name || PROJECT_META[old.type].title),
      createdAt: old.configuredAt ?? Date.now(),
    };

    // Помечаем миграцию как выполненную — legacy-ключ больше не нужен
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    localStorage.removeItem(STORAGE_KEYS._LEGACY_PROJECT_CONFIG);

    return [migrated];
  } catch {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    return [];
  }
}

/* =====================================================
   PROVIDER
===================================================== */

export function ProjectProvider({ children }) {
  const [projects, setProjectsState] = useState(() => {
    const list = loadProjects();
    const migrated = migrateFromLegacy(list);
    if (migrated.length > 0 && list.length === 0) {
      saveProjects(migrated);
    }
    return migrated.length > 0 ? migrated : list;
  });

  const [activeId, setActiveIdState] = useState(() => {
    const id = loadActiveId();
    // проверяем, что ID реально существует в списке
    const list = loadProjects();
    const migrated = migrateFromLegacy(list);
    const allProjects = migrated.length > 0 && list.length === 0 ? migrated : list;
    if (id && allProjects.some((p) => p.id === id)) return id;
    return allProjects[0]?.id ?? null;
  });

  /* =========================
     DERIVED
  ========================= */
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  /** Тип активного проекта — для useProjectConfig / useProjectVars */
  const project = activeProject?.type ?? null;
  const projectName = activeProject?.name ?? "";
  const isConfigured = activeProject !== null;

  /* =========================
     MUTATORS
  ========================= */

  const _setProjects = useCallback((next) => {
    saveProjects(next);
    setProjectsState(next);
  }, []);

  const _setActiveId = useCallback((id) => {
    saveActiveId(id);
    setActiveIdState(id);
  }, []);

  /** Создаёт новый проект и делает его активным */
  const addProject = useCallback(
    (name, type) => {
      if (!type || !PROJECT_META[type]) return null;

      const id = String(Date.now());
      const folder = toFolderName(name || PROJECT_META[type].title);

      // Гарантируем уникальность folderName
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

      const next = [...projects, newProject];
      _setProjects(next);
      _setActiveId(id);
      return newProject;
    },
    [projects, _setProjects, _setActiveId],
  );

  /** Псевдоним для первого запуска (ProjectSetupScreen) */
  const configure = useCallback(
    (type, name) => addProject(name, type),
    [addProject],
  );

  /** Переключает активный проект */
  const selectProject = useCallback(
    (id) => {
      if (!projects.some((p) => p.id === id)) return;
      _setActiveId(id);
    },
    [projects, _setActiveId],
  );

  /** Переименовывает проект и обновляет folderName */
  const renameProject = useCallback(
    (id, name) => {
      const trimmed = name?.trim();
      if (!trimmed) return;

      const newFolder = toFolderName(trimmed);
      const existingFolders = new Set(
        projects.filter((p) => p.id !== id).map((p) => p.folderName),
      );
      let uniqueFolder = newFolder;
      let suffix = 2;
      while (existingFolders.has(uniqueFolder)) {
        uniqueFolder = `${newFolder}_${suffix++}`;
      }

      _setProjects(
        projects.map((p) =>
          p.id === id ? { ...p, name: trimmed, folderName: uniqueFolder } : p,
        ),
      );
    },
    [projects, _setProjects],
  );

  /** Меняет тип проекта */
  const changeProjectType = useCallback(
    (id, type) => {
      if (!PROJECT_META[type]) return;
      _setProjects(
        projects.map((p) => (p.id === id ? { ...p, type } : p)),
      );
    },
    [projects, _setProjects],
  );

  /** Удаляет проект. Если удаляем активный — переключаемся на первый оставшийся */
  const removeProject = useCallback(
    (id) => {
      const next = projects.filter((p) => p.id !== id);
      _setProjects(next);

      if (activeId === id) {
        _setActiveId(next[0]?.id ?? null);
      }
    },
    [projects, activeId, _setProjects, _setActiveId],
  );

  /** Legacy changeProject — меняет тип активного проекта */
  const changeProject = useCallback(
    (type) => {
      if (activeId) changeProjectType(activeId, type);
    },
    [activeId, changeProjectType],
  );

  /* =========================
     CONTEXT VALUE
  ========================= */
  const value = useMemo(
    () => ({
      // список
      projects,
      // активный
      activeProject,
      activeId,
      // производные (обратная совместимость)
      project,
      projectName,
      isConfigured,
      // действия
      addProject,
      configure,
      selectProject,
      renameProject,
      changeProjectType,
      removeProject,
      changeProject,
    }),
    [
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
      changeProjectType,
      removeProject,
      changeProject,
    ],
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
