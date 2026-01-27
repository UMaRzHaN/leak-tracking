import { useMemo } from "react";
import { PROJECTS } from "../../configs/projects";
import { useProject } from "./ProjectContext";

export function useProjectConfig() {
  const { project } = useProject();

  return useMemo(() => PROJECTS[project] || PROJECTS.compression, [project]);
}
