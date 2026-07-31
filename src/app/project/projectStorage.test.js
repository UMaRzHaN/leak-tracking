import { beforeEach, describe, expect, it } from "vitest";
import {
  loadActiveId,
  loadProjects,
  preserveAndResetCorruptedProjects,
  saveActiveId,
  saveProjects,
  toFolderName,
  toUniqueFolderName,
} from "./projectStorage";
import { STORAGE_KEYS } from "./storageKeys";

describe("projectStorage", () => {
  beforeEach(() => localStorage.clear());

  it("creates safe folder names from strings and non-string values", () => {
    expect(toFolderName("  North <Field>: A/B  ")).toBe("North_Field_AB");
    expect(toFolderName("North\u0001Field")).toBe("NorthField");
    expect(toFolderName(2026)).toBe("2026");
    expect(toFolderName(null)).toBe("project");
    expect(toFolderName(".")).toBe("project");
    expect(toFolderName("..")).toBe("project");
    expect([...toFolderName(`${"A".repeat(49)}😀`)]).toHaveLength(50);
    expect(toFolderName(`${"A".repeat(49)}😀`)).toMatch(/😀$/);
  });

  it("keeps generated duplicate folder names within the segment limit", () => {
    const longName = "A".repeat(80);
    const base = toFolderName(longName);
    const duplicate = toUniqueFolderName(longName, new Set([base]));

    expect(base).toHaveLength(50);
    expect(duplicate).toHaveLength(50);
    expect(duplicate).toMatch(/_2$/);
  });

  it("round-trips the project list and surfaces malformed stored values", () => {
    const projects = [
      {
        id: "project-1",
        name: "Project 1",
        type: "upstream",
        folderName: "Project_1",
        createdAt: 1,
      },
    ];
    saveProjects(projects);
    expect(loadProjects()).toEqual(projects);

    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, "{broken");
    let readError;
    try {
      loadProjects();
    } catch (error) {
      readError = error;
    }
    expect(readError).toMatchObject({
      code: "PROJECT_LIST_READ_FAILED",
      recoveryValue: "{broken",
    });
    expect(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)).toBe("{broken");

    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify({}));
    expect(() => loadProjects()).toThrow(/preserved for recovery/);

    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([{ ...projects[0], folderName: ".." }]),
    );
    expect(() => loadProjects()).toThrow(/preserved for recovery/);

    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([{ ...projects[0], folderName: "bad\u0000folder" }]),
    );
    expect(() => loadProjects()).toThrow(/preserved for recovery/);

    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([{ ...projects[0], folderName: `${"A".repeat(50)}_2` }]),
    );
    expect(loadProjects()[0].folderName).toBe(`${"A".repeat(50)}_2`);

    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([projects[0], { ...projects[0], name: "Duplicate" }]),
    );
    expect(() => loadProjects()).toThrow(/preserved for recovery/);

    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([{ ...projects[0], id: "../../outside" }]),
    );
    expect(() => loadProjects()).toThrow(/preserved for recovery/);

    localStorage.setItem(
      STORAGE_KEYS.PROJECTS_LIST,
      JSON.stringify([{ ...projects[0], legacyStorageType: "midstream" }]),
    );
    expect(() => loadProjects()).toThrow(/preserved for recovery/);

    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify([null]));
    expect(() => loadProjects()).toThrow(/preserved for recovery/);
  });

  it("preserves a corrupted project list before resetting startup state", () => {
    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, "{broken");
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, "project-1");

    preserveAndResetCorruptedProjects("{broken");

    expect(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST_RECOVERY)).toBe(
      "{broken",
    );
  });

  it("saves and clears the active project id", () => {
    saveActiveId("project-1");
    expect(loadActiveId()).toBe("project-1");
    saveActiveId(null);
    expect(loadActiveId()).toBeNull();
  });
});
