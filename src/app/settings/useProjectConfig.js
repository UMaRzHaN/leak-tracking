import { useMemo } from "react";
import { PROJECTS } from "../../configs/projects";
import { useAppSettings } from "./useAppSettings";

export function useProjectConfig() {
  const { project } = useAppSettings();

  return useMemo(() => PROJECTS[project] || PROJECTS.compression, [project]);
}
