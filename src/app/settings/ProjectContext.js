import React, { createContext, useContext, useState } from "react";
import { STORAGE_KEYS } from "./storageKeys";

const DEFAULT_PROJECT = "compression";

const ProjectContext = createContext();

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(
    localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT) || DEFAULT_PROJECT
  );

  const changeProject = (id) => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, id);
    setProject(id);
    console.log(`✨ Проект изменён на: ${id}`);
  };

  return (
    <ProjectContext.Provider value={{ project, changeProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}
