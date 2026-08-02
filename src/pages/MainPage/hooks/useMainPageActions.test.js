import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMainPageActions } from "./useMainPageActions";

const deletePhoto = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ deletePhoto }),
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "project-1" } }),
}));

vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: {} }),
}));

vi.mock("@/utils/haptics", () => ({
  hapticSuccess: vi.fn(),
}));

describe("useMainPageActions", () => {
  it("does not delete a shared photo when removing a recent leak", async () => {
    deletePhoto.mockReset().mockResolvedValue(undefined);
    const sharedPath = "idb://shared";
    const data = [
      { id: "leak-1", photo: sharedPath },
      { id: "leak-2", photo_repair: sharedPath },
    ];
    const setData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMainPageActions({
        data,
        setData,
        userProfile: { name: "Inspector" },
      }),
    );

    await act(async () => {
      await result.current.handleDeleteLeak("leak-1");
    });

    expect(setData).toHaveBeenCalledWith([data[1]]);
    expect(deletePhoto).not.toHaveBeenCalled();
  });
});
