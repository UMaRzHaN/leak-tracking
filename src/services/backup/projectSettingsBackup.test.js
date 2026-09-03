import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  buildProjectBackupZip,
  importIntoExistingProject,
  importProjectZip,
  peekBackupZip,
} from "./projectBackupService";
import {
  readProjectSettings,
  writeProjectSettings,
} from "@/app/project/projectSettings";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";

const SOURCE_PROJECT = {
  id: "source-project",
  name: "Settings source",
  type: "upstream",
  folderName: "Settings_source",
  syncId: "settings-sync-1234",
};

const SETTINGS = {
  hiddenFields: ["component", "note"],
  excelMonitoringExportMode: "latest_per_round",
  photoRequirements: {
    leakPhotoRequired: false,
    monitoringPhotoRequired: false,
    componentPhotoRequired: true,
  },
  voiceCorrections: [],
  updatedAt: 200,
};

async function makeSettingsArchive(settings = SETTINGS) {
  const zip = new JSZip();
  zip.file("backup.json", "[]");
  zip.file(
    "project.json",
    JSON.stringify({
      schemaVersion: 5,
      project: SOURCE_PROJECT,
      settings,
      sync: { version: 1, deleted: {}, varsUpdatedAt: 0 },
    }),
  );
  return zip.generateAsync({ type: "blob" });
}

function makeExistingContext(project = SOURCE_PROJECT) {
  return {
    overwriteProject: vi.fn(() => true),
    setProjectSyncId: vi.fn(),
    saveRef: { current: vi.fn().mockResolvedValue(undefined) },
    activeProjectIdRef: { current: project.id },
    photoReadyRef: { current: true },
    existingProject: project,
  };
}

describe("project settings backup and synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);
    vi.spyOn(PhotoRepository, "gcOrphaned").mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("exports settings in schema v5 and restores them into a new project", async () => {
    writeProjectSettings(SOURCE_PROJECT.id, SETTINGS, { emit: false });
    const archive = await buildProjectBackupZip({
      leaks: [],
      idbGet: null,
      project: SOURCE_PROJECT,
      vars: {},
    });
    const peek = await peekBackupZip(archive);
    expect(peek.meta.schemaVersion).toBe(5);
    expect(peek.meta.settings).toEqual(SETTINGS);

    localStorage.clear();
    const restoredProject = {
      ...SOURCE_PROJECT,
      id: "restored-project",
      name: "Restored settings",
    };
    const context = {
      addProject: vi.fn(() => {
        context.activeProjectIdRef.current = restoredProject.id;
        return restoredProject;
      }),
      removeProject: vi.fn(),
      savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
      saveRef: { current: vi.fn().mockResolvedValue(undefined) },
      activeProjectIdRef: { current: null },
      photoReadyRef: { current: true },
    };

    await importProjectZip(archive, context);

    expect(readProjectSettings(restoredProject.id)).toEqual(SETTINGS);
  });

  it("rolls restored settings back when creating the project fails", async () => {
    writeProjectSettings(SOURCE_PROJECT.id, SETTINGS, { emit: false });
    const archive = await buildProjectBackupZip({
      leaks: [],
      idbGet: null,
      project: SOURCE_PROJECT,
      vars: {},
    });
    localStorage.clear();
    const failedProject = { ...SOURCE_PROJECT, id: "failed-project" };
    const context = {
      addProject: vi.fn(() => {
        context.activeProjectIdRef.current = failedProject.id;
        return failedProject;
      }),
      removeProject: vi.fn(),
      savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
      saveRef: { current: vi.fn().mockRejectedValue(new Error("save failed")) },
      activeProjectIdRef: { current: null },
      photoReadyRef: { current: true },
    };

    await expect(importProjectZip(archive, context)).rejects.toThrow(
      "save failed",
    );

    expect(context.removeProject).toHaveBeenCalledWith(failedProject.id);
    expect(
      localStorage.getItem("app:failed-project:hidden_fields_v1"),
    ).toBeNull();
    expect(
      localStorage.getItem("app:failed-project:settings_updated_at_v1"),
    ).toBeNull();
  });

  it("restores archived settings when an existing project is overwritten", async () => {
    const archive = await makeSettingsArchive();
    writeProjectSettings(
      SOURCE_PROJECT.id,
      { ...SETTINGS, hiddenFields: ["description"], updatedAt: 500 },
      { emit: false },
    );

    await importIntoExistingProject(
      archive,
      makeExistingContext(),
      "overwrite",
    );

    expect(readProjectSettings(SOURCE_PROJECT.id)).toEqual(SETTINGS);
  });

  it("resets settings when overwriting from a legacy archive", async () => {
    const zip = new JSZip();
    zip.file("backup.json", "[]");
    zip.file(
      "project.json",
      JSON.stringify({
        schemaVersion: 4,
        project: SOURCE_PROJECT,
      }),
    );
    const archive = await zip.generateAsync({ type: "blob" });
    writeProjectSettings(SOURCE_PROJECT.id, SETTINGS, { emit: false });

    await importIntoExistingProject(
      archive,
      makeExistingContext(),
      "overwrite",
    );

    expect(readProjectSettings(SOURCE_PROJECT.id)).toEqual({
      hiddenFields: [],
      excelMonitoringExportMode: "full",
      photoRequirements: {
        leakPhotoRequired: true,
        monitoringPhotoRequired: true,
        componentPhotoRequired: true,
      },
      voiceCorrections: [],
      updatedAt: 0,
    });
  });
  it("applies newer archived settings during a manual merge", async () => {
    const archive = await makeSettingsArchive(SETTINGS);
    writeProjectSettings(
      SOURCE_PROJECT.id,
      { ...SETTINGS, hiddenFields: ["description"], updatedAt: 100 },
      { emit: false },
    );

    await importIntoExistingProject(archive, makeExistingContext(), "merge");

    expect(readProjectSettings(SOURCE_PROJECT.id)).toEqual(SETTINGS);
  });

  it("applies newer settings during two-way synchronization", async () => {
    const archive = await makeSettingsArchive(SETTINGS);
    writeProjectSettings(
      SOURCE_PROJECT.id,
      { ...SETTINGS, hiddenFields: ["description"], updatedAt: 100 },
      { emit: false },
    );

    await importIntoExistingProject(archive, makeExistingContext(), "sync");

    expect(readProjectSettings(SOURCE_PROJECT.id)).toEqual(SETTINGS);
  });

  it("keeps newer local settings when an older device synchronizes", async () => {
    const archive = await makeSettingsArchive({ ...SETTINGS, updatedAt: 100 });
    const local = {
      ...SETTINGS,
      hiddenFields: ["description"],
      voiceCorrections: [],
      updatedAt: 300,
    };
    writeProjectSettings(SOURCE_PROJECT.id, local, { emit: false });

    await importIntoExistingProject(archive, makeExistingContext(), "sync");

    expect(readProjectSettings(SOURCE_PROJECT.id)).toEqual(local);
  });
});
