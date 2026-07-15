import { beforeEach, describe, expect, it } from "vitest";
import {
  loadActiveId,
  loadProjects,
  saveActiveId,
  saveProjects,
  toFolderName,
} from "./projectStorage";
import { STORAGE_KEYS } from "./storageKeys";

describe("projectStorage", () => {
  beforeEach(() => localStorage.clear());

  it("creates safe folder names from strings and non-string values", () => {
    expect(toFolderName("  North <Field>: A/B  ")).toBe("North_Field_AB");
    expect(toFolderName(2026)).toBe("2026");
    expect(toFolderName(null)).toBe("project");
  });

  it("round-trips the project list and rejects malformed stored values", () => {
    const projects = [{ id: "project-1" }];
    saveProjects(projects);
    expect(loadProjects()).toEqual(projects);

    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, "{broken");
    expect(loadProjects()).toEqual([]);

    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify({}));
    expect(loadProjects()).toEqual([]);
  });

  it("saves and clears the active project id", () => {
    saveActiveId("project-1");
    expect(loadActiveId()).toBe("project-1");
    saveActiveId(null);
    expect(loadActiveId()).toBeNull();
  });
});
