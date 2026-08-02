import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLeakActions } from "./useLeakActions";

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "project-1" } }),
}));

vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {} }),
}));

vi.mock("@/utils/haptics", () => ({
  hapticSuccess: vi.fn(),
}));

function renderActions({ data, userProfile = { name: "Inspector" } }) {
  const setData = vi.fn().mockResolvedValue(undefined);
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

describe("useLeakActions", () => {
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

  it("does not open status actions without a user name", () => {
    const leak = { id: "leak-1", status: "open" };
    const { result, notify } = renderActions({
      data: [leak],
      userProfile: { name: "   " },
    });

    act(() => {
      result.current.handlePickStatus(leak);
    });

    expect(result.current.pickerLeak).toBeNull();
    expect(notify).toHaveBeenCalledWith(
      "error",
      "Заполните имя пользователя в профиле",
    );
  });
});
