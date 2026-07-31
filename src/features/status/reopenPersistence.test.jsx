import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLeakActions } from "@/pages/DataBase/hooks/useLeakActions";
import { useMainPageActions } from "@/pages/MainPage/hooks/useMainPageActions";

const mocks = vi.hoisted(() => ({
  deletePhoto: vi.fn(),
}));

vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ deletePhoto: mocks.deletePhoto }),
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

const actionHooks = [
  {
    label: "database",
    useActions: (props) => useLeakActions({ ...props, notify: vi.fn() }),
  },
  {
    label: "main page",
    useActions: (props) => useMainPageActions(props),
  },
];

describe.each(actionHooks)("$label reopen persistence", ({ useActions }) => {
  it("requests a non-optimistic commit before closing the modal", async () => {
    const leak = {
      id: "leak-1",
      leak_id: "1001",
      status: "resolved",
      photo: "idb://original",
      photo_after: "idb://resolved",
      equipmentType: "pink bag",
    };
    const setData = vi.fn().mockResolvedValue(undefined);
    mocks.deletePhoto.mockReset().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActions({
        data: [leak],
        setData,
        deletePhoto: mocks.deletePhoto,
        userProfile: { name: "Inspector" },
      }),
    );

    act(() => result.current.setReopenLeak(leak));
    await act(async () => {
      await result.current.handleReopenConfirm({});
    });

    expect(setData).toHaveBeenCalledOnce();
    expect(setData.mock.calls[0][1]).toEqual({ optimistic: false });
    expect(result.current.reopenLeak).toBeNull();
    expect(mocks.deletePhoto).toHaveBeenCalledWith("idb://original");
  });
});
