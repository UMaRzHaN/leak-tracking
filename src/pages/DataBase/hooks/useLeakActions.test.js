import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLeakActions } from "./useLeakActions";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const project = vi.hoisted(() => ({ current: { id: "project-1" } }));
vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: project.current }),
}));

const useProjectVars = vi.hoisted(() => vi.fn(() => ({ vars: {} })));
vi.mock("@/app/project/hooks/useProjectVars", () => ({ useProjectVars }));

vi.mock("@/utils/haptics", () => ({
  hapticSuccess: vi.fn(),
}));

function renderActions({
  data,
  userProfile = { name: "Inspector" },
  setData = vi.fn().mockResolvedValue(undefined),
}) {
  const deletePhoto = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const hook = renderHook(() =>
    useLeakActions({
      data,
      setData,
      notify,
      deletePhoto,
      userProfile,
    }),
  );
  return { ...hook, setData, deletePhoto, notify };
}

const openLeak = (overrides = {}) => ({
  id: "leak-1",
  status: "open",
  ...overrides,
});

describe("useLeakActions", () => {
  describe("deleting", () => {
    it("keeps a photo file when another leak still references it", async () => {
      const sharedPath = "idb://shared";
      const data = [
        { id: "leak-1", photo: sharedPath },
        { id: "leak-2", photo_after: sharedPath },
      ];
      const { result, setData, deletePhoto } = renderActions({ data });

      await act(async () => {
        await result.current.handleDelete("leak-1");
      });

      expect(setData).toHaveBeenCalledWith([data[1]]);
      expect(deletePhoto).not.toHaveBeenCalled();
    });

    it("deletes photo files that are unique to the removed leak", async () => {
      const data = [
        {
          id: "leak-1",
          photo: "idb://before",
          monitoringRecords: [{ photo: "idb://monitoring" }],
        },
        { id: "leak-2" },
      ];
      const { result, deletePhoto } = renderActions({ data });

      await act(async () => {
        await result.current.handleDelete("leak-1");
      });

      expect(deletePhoto).toHaveBeenCalledTimes(2);
      expect(deletePhoto).toHaveBeenCalledWith("idb://before");
      expect(deletePhoto).toHaveBeenCalledWith("idb://monitoring");
    });

    it("reports the failure and keeps the photo when the write fails", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("quota exceeded"));
      const { result, notify, deletePhoto } = renderActions({
        data: [{ id: "leak-1", photo: "idb://before" }],
        setData,
      });

      await act(async () => {
        await result.current.handleDelete("leak-1");
      });

      expect(notify).toHaveBeenCalledWith(
        "error",
        "Delete error: quota exceeded",
      );
      // The record is still there, so its photo must not be collected.
      expect(deletePhoto).not.toHaveBeenCalled();
    });

    it("tells the caller which record went away", async () => {
      const onDeleted = vi.fn();
      const { result } = renderActions({ data: [{ id: "leak-1" }] });

      await act(async () => {
        await result.current.handleDelete("leak-1", { onDeleted });
      });

      expect(onDeleted).toHaveBeenCalledWith("leak-1");
    });
  });

  describe("saving an edited leak", () => {
    it("replaces the record and closes the details sheet", async () => {
      const leak = openLeak({ note: "before" });
      const { result, setData } = renderActions({ data: [leak] });

      act(() => result.current.setActiveLeak(leak));
      await act(async () => {
        await result.current.handleSave({ ...leak, note: "after" });
      });

      expect(setData.mock.calls[0][0]).toEqual([{ ...leak, note: "after" }]);
      expect(result.current.activeLeak).toBeNull();
    });

    // Unlike the others this one rethrows: the details sheet has its own
    // saving state to unwind.
    it("rethrows so the caller can react, and keeps the sheet open", async () => {
      const setData = vi.fn().mockRejectedValue(new Error("locked"));
      const leak = openLeak();
      const { result, notify } = renderActions({ data: [leak], setData });

      act(() => result.current.setActiveLeak(leak));
      await expect(
        act(async () => {
          await result.current.handleSave(leak);
        }),
      ).rejects.toThrow("locked");

      expect(notify).toHaveBeenCalledWith("error", "Save error: locked");
      expect(result.current.activeLeak).toEqual(leak);
    });
  });

  it("удаляет запись и без хранилища снимков", async () => {
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLeakActions({
        data: [openLeak({ photo: "idb://a" })],
        setData,
        notify: vi.fn(),
      }),
    );

    await act(() => result.current.handleDelete("leak-1"));

    expect(setData).toHaveBeenCalledWith([]);
  });

  it("без открытого проекта спрашивает переменные ни у какого", () => {
    project.current = null;
    renderHook(() =>
      useLeakActions({ data: [], setData: vi.fn(), notify: vi.fn() }),
    );

    expect(useProjectVars).toHaveBeenLastCalledWith(null);
    project.current = { id: "project-1" };
  });
});
