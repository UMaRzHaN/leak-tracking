import { describe, expect, it } from "vitest";

import { PROJECTS } from "./projects";

describe("project voice configs", () => {
  it("only references fields available in the project config", () => {
    for (const [projectType, projectConfig] of Object.entries(PROJECTS)) {
      const fieldKeys = new Set(
        projectConfig.system.fields.map((field) => field.key),
      );

      const voice = projectConfig.voice;
      expect(voice, projectType).toBeTruthy();
      expect(
        projectConfig.system.lossy,
        `${projectType}:${voice.input}`,
      ).toContain(voice.input);
      expect(fieldKeys.has(voice.input), `${projectType}:${voice.input}`).toBe(
        false,
      );

      for (const key of voice.outputFields) {
        expect(fieldKeys.has(key), `${projectType}:${key}`).toBe(true);
      }

      expect(voice.outputFields, projectType).toEqual(
        projectConfig.system.fields
          .filter((field) => field.voice)
          .map((field) => field.key),
      );

      for (const key of voice.synonymsFields) {
        expect(fieldKeys.has(key), `${projectType}:${key}`).toBe(true);
        expect(voice.outputFields).toContain(key);
      }
    }
  });
});
