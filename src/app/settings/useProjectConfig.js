import { useMemo } from "react";
import { PROJECTS } from "../../configs/projects";
import { useProjectData } from "./ProjectContext";

export function useProjectConfig() {
  const { project } = useProjectData();

  return useMemo(() => PROJECTS[project] || PROJECTS.midstream, [project]);
}
