import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importIntoExistingProject } from "./projectBackupService";
import { LeakRepository } from "@/repositories/LeakRepository";
import { PhotoRepository } from "@/repositories/PhotoRepository";
import { readAcceptances, saveAcceptances } from "@/utils/acceptanceStorage";
import { readStoredSurvey, saveSurvey } from "@/utils/surveyStorage";

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: vi.fn().mockResolvedValue([]), save: vi.fn() },
}));

vi.mock("@/hooks/photoService", () => ({
  getPhotoSrc: vi.fn().mockResolvedValue(null),
  getPhotoBlob: vi.fn().mockResolvedValue(null),
}));

const project = {
  id: "p-acc",
  name: "Приёмка",
  type: "upstream",
  folderName: "acc",
  syncId: "acc-sync-1234",
};

const invoice = (id, updatedAt) => ({
  id,
  number: id,
  items: [],
  batches: [],
  updatedAt,
});

const incomingSurvey = {
  updatedAt: "2026-10-05T00:00:00.000Z",
  groups: [{ name: "Цех 1", checked: 4 }],
};

async function archive(meta) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("backup.json", JSON.stringify([{ id: "l1", status: "open" }]));
  zip.file(
    "project.json",
    JSON.stringify({
      schemaVersion: 5,
      project: {
        name: project.name,
        type: project.type,
        folderName: project.folderName,
        syncId: project.syncId,
      },
      ...meta,
    }),
  );
  return zip.generateAsync({ type: "blob" });
}

function ctx(save = vi.fn().mockResolvedValue(undefined)) {
  return {
    overwriteProject: vi.fn(() => true),
    savePhotoRef: { current: vi.fn().mockResolvedValue(null) },
    saveRef: { current: save },
    activeProjectIdRef: { current: project.id },
    photoReadyRef: { current: true },
    existingProject: project,
  };
}

describe("накладные и обследование при приёме ZIP в существующий проект", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(LeakRepository, "getAll").mockResolvedValue([]);
    vi.spyOn(PhotoRepository, "gcOrphaned").mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("«Объединить» принимает накладные и обследование из архива", async () => {
    saveAcceptances(project.id, [invoice("local", "2026-10-01T00:00:00Z")]);
    const blob = await archive({
      acceptances: [invoice("remote", "2026-10-02T00:00:00Z")],
      survey: incomingSurvey,
    });

    await importIntoExistingProject(blob, ctx(), "merge");

    expect(readAcceptances(project.id).map((item) => item.id)).toEqual([
      "local",
      "remote",
    ]);
    expect(readStoredSurvey(project.id)?.groups[0].name).toBe("Цех 1");
  });

  it.each(["overwrite", "sync", "merge"])(
    "откат (%s) возвращает накладные и обследование, какими они были",
    async (mode) => {
      const local = [invoice("local", "2026-10-01T00:00:00Z")];
      saveAcceptances(project.id, local);
      saveSurvey(
        project.id,
        {
          updatedAt: "2026-09-01T00:00:00.000Z",
          groups: [{ name: "Цех 0", checked: 1 }],
        },
        { keepUpdatedAt: true },
      );
      const before = {
        acceptances: readAcceptances(project.id),
        survey: readStoredSurvey(project.id),
      };
      const blob = await archive({
        acceptances: [invoice("remote", "2026-10-02T00:00:00Z")],
        survey: incomingSurvey,
      });

      await expect(
        importIntoExistingProject(
          blob,
          ctx(vi.fn().mockRejectedValue(new Error("disk full"))),
          mode,
        ),
      ).rejects.toThrow("disk full");

      expect(readAcceptances(project.id)).toEqual(before.acceptances);
      expect(readStoredSurvey(project.id)).toEqual(before.survey);
    },
  );
});
