import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STATUS } from "@/utils/status";
import { useBulkActions } from "./useBulkActions";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

vi.mock("@/utils/haptics", () => ({
  hapticSuccess: vi.fn(),
}));

const modes = [
  {
    label: "resolve",
    status: STATUS.RESOLVED,
    photoKey: "photo_after",
    queueKey: "resolveQueue",
    confirmKey: "handleSequentialResolveConfirm",
  },
  {
    label: "repair",
    status: STATUS.IN_PROGRESS,
    photoKey: "photo_repair",
    queueKey: "repairQueue",
    confirmKey: "handleSequentialRepairConfirm",
  },
];

function renderBulkActions({
  setData,
  deletePhoto,
  photoKey,
  oldPath,
  status,
}) {
  const data = [
    {
      id: "leak-1",
      leak_id: "1001",
      status,
      [photoKey]: oldPath,
    },
  ];
  const notify = vi.fn();
  const hook = renderHook(() =>
    useBulkActions({
      data,
      setData,
      displayed: data,
      notify,
      deletePhoto,
      userProfile: { name: "Inspector" },
    }),
  );
  return { ...hook, notify };
}

describe.each(modes)("bulk sequential $label photo lifecycle", (mode) => {
  it("rolls back the newly saved photo when project persistence fails", async () => {
    const oldPath = `photos/old-${mode.label}.jpg`;
    const newPath = `photos/new-${mode.label}.jpg`;
    const setData = vi.fn().mockRejectedValue(new Error("database locked"));
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const { result, notify } = renderBulkActions({
      setData,
      deletePhoto,
      photoKey: mode.photoKey,
      oldPath,
      status:
        mode.status === STATUS.RESOLVED ? STATUS.IN_PROGRESS : STATUS.OPEN,
    });

    act(() => result.current.toggleSelected("leak-1"));
    await act(async () => {
      await result.current.handleBulkStatusChange(mode.status);
    });
    await act(async () => {
      await result.current[mode.confirmKey]({
        [mode.photoKey]: newPath,
      });
    });

    expect(deletePhoto).toHaveBeenCalledWith(newPath);
    expect(deletePhoto).not.toHaveBeenCalledWith(oldPath);
    expect(result.current[mode.queueKey]).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("database locked"),
    );
  });

  it("deletes the superseded photo only after a successful commit", async () => {
    const oldPath = `photos/old-${mode.label}.jpg`;
    const newPath = `photos/new-${mode.label}.jpg`;
    const setData = vi.fn().mockResolvedValue(undefined);
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const { result } = renderBulkActions({
      setData,
      deletePhoto,
      photoKey: mode.photoKey,
      oldPath,
      status:
        mode.status === STATUS.RESOLVED ? STATUS.IN_PROGRESS : STATUS.OPEN,
    });

    act(() => result.current.toggleSelected("leak-1"));
    await act(async () => {
      await result.current.handleBulkStatusChange(mode.status);
    });
    await act(async () => {
      await result.current[mode.confirmKey]({
        [mode.photoKey]: newPath,
      });
    });

    expect(setData).toHaveBeenCalledOnce();
    expect(setData.mock.calls[0][0][0][mode.photoKey]).toBe(newPath);
    expect(deletePhoto).toHaveBeenCalledWith(oldPath);
    expect(deletePhoto).not.toHaveBeenCalledWith(newPath);
    expect(result.current[mode.queueKey]).toHaveLength(0);
  });
});
