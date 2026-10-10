import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExcelProjectState } from "./useExcelProjectState";
import { readAcceptances, saveAcceptances } from "@/utils/acceptanceStorage";
import { readStoredSurvey } from "@/utils/surveyStorage";

const project = { id: "p-excel", name: "Excel", type: "upstream" };
const invoice = (id, updatedAt) => ({
  id,
  number: id,
  items: [],
  batches: [],
  updatedAt,
});

function mount() {
  return renderHook(() =>
    useExcelProjectState({
      activeProject: project,
      data: [],
      setVarsAsync: vi.fn(),
      restoreProjectMetadata: vi.fn(),
      restoreProjectSnapshot: vi.fn(() => true),
    }),
  ).result.current;
}

describe("накладные и обследование из служебного листа Excel", () => {
  beforeEach(() => localStorage.clear());

  it("вливаются при импорте и уходят при откате", async () => {
    saveAcceptances(project.id, [invoice("local", "2026-10-01T00:00:00Z")]);
    const state = mount();
    const snapshot = await state.captureExcelImportSnapshot();

    await act(() =>
      state.applyExcelArchiveMetadata({
        portableArchive: true,
        acceptances: [invoice("remote", "2026-10-02T00:00:00Z")],
        survey: {
          updatedAt: "2026-10-05T00:00:00.000Z",
          groups: [{ name: "Цех 1", checked: 2 }],
        },
      }),
    );
    expect(readAcceptances(project.id).map((item) => item.id)).toEqual([
      "local",
      "remote",
    ]);
    expect(readStoredSurvey(project.id)?.groups[0].name).toBe("Цех 1");

    await act(() => state.restoreExcelImportSnapshot(snapshot));
    expect(readAcceptances(project.id).map((item) => item.id)).toEqual([
      "local",
    ]);
    expect(readStoredSurvey(project.id)).toBeNull();
  });
});
