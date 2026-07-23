import { describe, expect, it } from "vitest";
import { PROJECTS } from "./projects";
import { PROJECT_LOCATION_CONFIG } from "./projectLocation.config";

describe("project location configuration", () => {
  it.each(Object.entries(PROJECTS))(
    "keeps map and project location fields aligned for %s",
    (projectType, projectConfig) => {
      const mapConfig = PROJECT_LOCATION_CONFIG[projectType];

      expect(mapConfig).toBeTruthy();
      expect(mapConfig.main).toBe(projectConfig.system.location.main);
      expect(mapConfig.secondary).toBe(projectConfig.system.location.secondary);
      expect(mapConfig.last).toBe(projectConfig.system.location.last);
    },
  );
});
