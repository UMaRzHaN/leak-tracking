import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  savePhoto: vi.fn(),
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({
    activeProject: { id: "proj-1", folderName: "project_one" },
  }),
}));
vi.mock("@/repositories/PhotoRepository", () => ({
  PhotoRepository: { save: mocks.savePhoto },
}));
// На телефоне ждать IndexedDB не нужно — так тест не зависит от неё.
vi.mock("@/utils/platform", () => ({ isNative: true }));

const { useStoredPhotoRepair } = await import("./useStoredPhotoRepair");

const jpeg = (tag) => new Blob([tag], { type: "image/jpeg" });

function corruptedLeak(round) {
  return {
    id: "leak-1",
    leak_id: "3830",
    status: "in_progress",
    events: [{ id: "leak-1-1", type: "inspection", photo: round }],
  };
}

function renderRepair(dataRef, save, overrides = {}) {
  return renderHook((props) => useStoredPhotoRepair(props), {
    initialProps: {
      dataRef,
      dataLoaded: true,
      dataProjectId: "proj-1",
      loadError: null,
      save,
      ...overrides,
    },
  });
}

describe("useStoredPhotoRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.savePhoto.mockImplementation(
      async (_blob, { leakId }) => `data://LeakReports/project_one/${leakId}`,
    );
  });

  it("stores the Blob and saves the record with a path in its place", async () => {
    const dataRef = { current: [corruptedLeak(jpeg("round"))] };
    const save = vi.fn().mockResolvedValue(undefined);

    renderRepair(dataRef, save);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(mocks.savePhoto).toHaveBeenCalledWith(
      expect.any(Blob),
      {
        projectId: "proj-1",
        leakId: "3830_event_leak-1-1",
        folderName: "project_one",
      },
      [],
      expect.objectContaining({ cleanupOldVersions: false }),
    );
    const [saved] = save.mock.calls[0][0];
    expect(saved.events[0].photo).toBe(
      "data://LeakReports/project_one/3830_event_leak-1-1",
    );
  });

  it("keeps an edit made while the photos were being stored", async () => {
    const round = jpeg("round");
    const dataRef = { current: [corruptedLeak(round)] };
    const save = vi.fn().mockResolvedValue(undefined);
    mocks.savePhoto.mockImplementation(async () => {
      // Пока снимок сохранялся, запись поправили.
      dataRef.current = [
        { ...corruptedLeak(round), comment: "поправлено во время починки" },
      ];
      return "data://LeakReports/project_one/round";
    });

    renderRepair(dataRef, save);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const [saved] = save.mock.calls[0][0];
    expect(saved.comment).toBe("поправлено во время починки");
    expect(saved.events[0].photo).toBe("data://LeakReports/project_one/round");
  });

  it("does nothing when no record is corrupted", async () => {
    const dataRef = {
      current: [{ id: "a", events: [{ photo: "idb://round" }] }],
    };
    const save = vi.fn();

    renderRepair(dataRef, save);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.savePhoto).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("tries once per project when a photo cannot be stored", async () => {
    mocks.savePhoto.mockResolvedValue(null);
    const dataRef = { current: [corruptedLeak(jpeg("round"))] };
    const save = vi.fn();

    const { rerender } = renderRepair(dataRef, save);
    await waitFor(() => expect(mocks.savePhoto).toHaveBeenCalledOnce());

    rerender({
      dataRef,
      dataLoaded: true,
      dataProjectId: "proj-1",
      loadError: new Error("перерисовка"),
      save,
    });
    rerender({
      dataRef,
      dataLoaded: true,
      dataProjectId: "proj-1",
      loadError: null,
      save,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.savePhoto).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
});
